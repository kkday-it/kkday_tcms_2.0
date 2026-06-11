"""
Google OAuth 2.0 Authorization Code Flow for TCMS 1.5

Routes:
  GET /users/google-oauth/start     → redirect to Google authorization page
  GET /users/google-oauth/callback  → handle code, login/create user, redirect frontend
"""

import secrets
import httpx

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import issue_web_session_token
from app.core.config import settings
from app.db.database import get_db
from app.models.user import User

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# ── In-memory state store (simple, single-process safe) ──────────────────────
# Maps state → True (valid, not yet consumed). Stored in-process; resets on restart.
_valid_states: set[str] = set()


def _generate_state() -> str:
    state = secrets.token_urlsafe(32)
    _valid_states.add(state)
    return state


def _consume_state(state: str) -> bool:
    return _valid_states.discard(state) is None if state in _valid_states else False


def _check_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or not settings.GOOGLE_OAUTH_REDIRECT_URI:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured on this server."
        )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/start", tags=["Google OAuth"])
async def google_oauth_start():
    """Redirect browser to Google's OAuth 2.0 authorization page."""
    _check_configured()
    state = _generate_state()
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query}")


@router.get("/callback", tags=["Google OAuth"])
async def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google's redirect-back after user grants permission."""
    _check_configured()

    frontend_base = settings.FRONTEND_BASE_URL.rstrip("/")
    error_redirect = f"{frontend_base}/login?error=google_auth_failed"

    # ── User denied or Google error ────────────────────────────────────────
    if error or not code:
        return RedirectResponse(url=error_redirect)

    # ── Exchange authorization code for tokens ─────────────────────────────
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        })

    if token_resp.status_code != 200:
        return RedirectResponse(url=error_redirect)

    tokens = token_resp.json()
    access_token_google = tokens.get("access_token")
    if not access_token_google:
        return RedirectResponse(url=error_redirect)

    # ── Fetch Google user info ─────────────────────────────────────────────
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token_google}"},
        )

    if userinfo_resp.status_code != 200:
        return RedirectResponse(url=error_redirect)

    userinfo = userinfo_resp.json()
    google_id: str = userinfo.get("sub", "")
    email: str = userinfo.get("email", "")
    full_name: str = userinfo.get("name", "")

    if not google_id or not email:
        return RedirectResponse(url=error_redirect)

    # ── Look up or create user ─────────────────────────────────────────────
    # 1. Match by google_id first (returning user via Google)
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalars().first()

    if not user:
        # 2. Match by email (existing password-based account → link Google)
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()

        if user:
            # Link the Google ID to the existing account
            user.google_id = google_id
            if not user.full_name and full_name:
                user.full_name = full_name
        else:
            # 3. Brand-new user via Google SSO → auto-provision with QA role
            username_base = email.split("@")[0].replace(".", "_")
            # Ensure uniqueness
            username = username_base
            suffix = 1
            while True:
                dup = await db.execute(select(User).where(User.username == username))
                if not dup.scalars().first():
                    break
                username = f"{username_base}_{suffix}"
                suffix += 1

            user = User(
                username=username,
                email=email,
                full_name=full_name or username,
                google_id=google_id,
                role="QA",
                is_active=True,
                force_change_password=False,
                hashed_password=None,  # Google SSO users don't need a password
            )
            db.add(user)

    if not user.is_active:
        return RedirectResponse(url=f"{frontend_base}/login?error=account_disabled")

    # Record the successful login (same semantics as /users/login).
    user.last_login = func.now()

    await db.commit()
    await db.refresh(user)

    # Issue a real bearer token the same way /users/login does. Before this
    # fix the callback wrote a hardcoded "google-sso-token" string into the
    # redirect, which every Google-login user then stored as their
    # `tcms_token`. That string doesn't match any row in tcms_api_tokens, so
    # PR-3's get_current_user took Path 1, found nothing, and 401'd every
    # subsequent request — bricking the whole UI for Google-login users.
    access_token = await issue_web_session_token(db, user.id, label="web-session-google")

    # ── Build frontend redirect URL with session info ──────────────────────
    # We pass the minimal session data as query params so the frontend
    # can store them in localStorage (same pattern as the normal login).
    import urllib.parse
    params = urllib.parse.urlencode({
        "token": access_token,
        "user_id": user.id,
        "role": user.role,
        "full_name": user.full_name or "",
    })
    return RedirectResponse(url=f"{frontend_base}/auth/google/callback?{params}")
