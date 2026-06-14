"""Shared FastAPI dependencies for auth + audit.

PR-1 ships this module but does NOT add `Depends(...)` to existing endpoints — those
are wired up in PR-3 after the frontend in PR-2 starts sending real tokens. During the
2-week grace period, `get_current_user` also accepts the legacy mock token plus an
`X-User-Id` header, transparently issuing a real token via the `X-Auto-Issued-Token`
response header so frontends migrate without forcing a re-login.
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import generate_api_token, hash_api_token
from app.db.database import get_db
from app.models.api_token import ApiToken
from app.models.audit_log import AuditLog
from app.models.user import User

log = logging.getLogger("tcms.auth")

# Surface to the user in 401 / 403 bodies and to the WWW-Authenticate header.
TCMS_UI_URL = os.environ.get("TCMS_UI_URL", "http://autotest-service.sit.kkday.com:8081/tcms")
# 401/403 detail bodies surface this URL so users know where to (re)generate
# a token. Moved out of Settings into /account in this PR — keep the anchor
# `#api-tokens` so future tabs on Account don't force this constant to update.
TOKEN_PAGE = f"{TCMS_UI_URL}/account#api-tokens"
CONTACT = os.environ.get("TCMS_AUTH_CONTACT", "lance.chien@kkday.com")

# Legacy header still used as the actor source — kept for grace period.
LEGACY_MOCK_TOKEN = "mock-jwt-token-for-now"
WEB_SESSION_TTL_DAYS = 7
GRACE_AUTO_TOKEN_TTL_DAYS = 7

# Idle timeout for *browser sessions only*. A web-session token whose last activity
# is older than this is treated as expired → 401 → the frontend bounces to /login.
# API tokens (any other label) are deliberately exempt: bots/CI hold long-lived tokens
# and must not be logged out for being "idle". 0 disables the idle check entirely.
WEB_SESSION_IDLE_MINUTES = int(os.environ.get("TCMS_WEB_SESSION_IDLE_MINUTES", "60"))
# Labels minted for browser logins (see issue_web_session_token + the grace-period
# auto-migration). Only these are subject to the idle timeout.
WEB_SESSION_LABELS = {"web-session", "auto-migrated"}
# Frontend sets `X-TCMS-Activity: background` on timer-driven polls (presence heartbeat,
# DB health). Those keep the widgets live but must NOT count as user activity — otherwise
# an open-but-idle tab would refresh `last_used_at` forever and never time out. Such
# requests still go through the idle check, so the next background ping after the window
# elapses is what actually 401s an abandoned tab.
ACTIVITY_HEADER = "x-tcms-activity"
BACKGROUND_ACTIVITY = "background"


def utcnow() -> _dt.datetime:
    """Timezone-aware UTC now. The token columns are `DateTime(timezone=True)`, so on
    PostgreSQL (asyncpg) reads come back tz-aware; comparing against a naive
    `datetime.utcnow()` would raise TypeError. Always use aware datetimes here."""
    return _dt.datetime.now(_dt.timezone.utc)


def _as_aware_utc(value: Optional[_dt.datetime]) -> Optional[_dt.datetime]:
    """Coerce a datetime read back from the DB to tz-aware UTC. Postgres (asyncpg)
    returns aware datetimes for `DateTime(timezone=True)`; SQLite returns naive ones.
    Normalizing here lets the expiry comparison work on both dialects."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=_dt.timezone.utc)


_MESSAGES = {
    "missing": (
        "TCMS API 已啟用 Bearer token 認證, 此 request 未帶 token。\n"
        f"請到 TCMS 帳號 → API Tokens 產生 token ({TOKEN_PAGE}),\n"
        "然後在每個 request 加上 header `Authorization: Bearer <your-token>`。\n"
        "建立後, raw token 只會顯示一次, 請妥善保存。"
    ),
    "invalid": (
        "Token 無效或不存在 (可能被撤銷, 或字串複製錯誤)。\n"
        f"請到 {TOKEN_PAGE} 重新產生。"
    ),
    "expired": (
        "Token 已過期 (web-session token 預設 7 天有效)。\n"
        f"請到 {TOKEN_PAGE} 產生新 token; bot / CI 場景請產 expires_in_days=null 的長效 token。"
    ),
    "idle_expired": (
        f"登入逾時：閒置超過 {WEB_SESSION_IDLE_MINUTES} 分鐘未操作，session 已自動登出。\n"
        "請重新登入。(此規則僅適用於瀏覽器登入; API token 不受影響。)"
    ),
    "forbidden": (
        "Token 對應的 user 角色不足以執行此操作。\n"
        "請聯絡 TCMS Admin 調整角色, 或改用 Admin / QA 帳號的 token。"
    ),
}


def _raise_auth_error(kind: str, request: Request, status_code: int = 401):
    log.warning(
        "[tcms.auth] %s path=%s method=%s ip=%s ua=%r",
        kind,
        request.url.path,
        request.method,
        request.client.host if request.client else "?",
        request.headers.get("user-agent", ""),
    )
    error_code = "tcms_role_forbidden" if status_code == 403 else f"tcms_token_{kind}"
    raise HTTPException(
        status_code=status_code,
        detail={
            "error": error_code,
            "message": _MESSAGES[kind],
            "token_page": TOKEN_PAGE,
            "header_format": "Authorization: Bearer <token>",
            "contact": CONTACT,
        },
        headers={"WWW-Authenticate": f'Bearer realm="TCMS", error="{kind}_token"'},
    )


async def issue_web_session_token(db: AsyncSession, user_id: int, label: str = "web-session") -> str:
    raw = generate_api_token()
    db.add(
        ApiToken(
            user_id=user_id,
            token_hash=hash_api_token(raw),
            label=label,
            expires_at=utcnow() + _dt.timedelta(days=WEB_SESSION_TTL_DAYS),
        )
    )
    await db.commit()
    return raw


async def get_current_user(
    request: Request,
    response: Response,
    authorization: str = Header(default=""),
    x_user_id: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    raw = ""
    if authorization.lower().startswith("bearer "):
        raw = authorization[7:].strip()

    # Path 1: real bearer token.
    if raw and raw != LEGACY_MOCK_TOKEN:
        row = (
            await db.execute(select(ApiToken).where(ApiToken.token_hash == hash_api_token(raw)))
        ).scalar_one_or_none()
        if not row:
            _raise_auth_error("invalid", request)
        now = utcnow()
        if row.expires_at and _as_aware_utc(row.expires_at) < now:
            _raise_auth_error("expired", request)
        # Idle timeout — browser sessions only. API tokens (other labels) are exempt.
        if (
            WEB_SESSION_IDLE_MINUTES > 0
            and row.label in WEB_SESSION_LABELS
            and row.last_used_at is not None
        ):
            idle_for = now - _as_aware_utc(row.last_used_at)
            if idle_for > _dt.timedelta(minutes=WEB_SESSION_IDLE_MINUTES):
                _raise_auth_error("idle_expired", request)
        user = await db.get(User, row.user_id)
        if not user or not user.is_active:
            _raise_auth_error("invalid", request)
        # Background polls (presence heartbeat, DB health) keep widgets alive but must
        # not reset the idle clock — otherwise an open-but-idle tab never times out.
        is_background = request.headers.get(ACTIVITY_HEADER, "").lower() == BACKGROUND_ACTIVITY
        if not is_background:
            row.last_used_at = now
            await db.commit()
            # Real activity also refreshes the presence idle clock (background
            # heartbeats keep the user online but must not clear "idle").
            from app.services import presence
            presence.mark_active(user.id, user.username)
        return user

    # Path 2: grace-period legacy mock token + X-User-Id header. Auto-issues a real
    # token so the next request from this client uses Path 1.
    # TODO(PR-4): remove this branch after 2026-06-13.
    if raw == LEGACY_MOCK_TOKEN and x_user_id:
        try:
            uid = int(x_user_id)
        except ValueError:
            _raise_auth_error("invalid", request)
        user = await db.get(User, uid)
        if not user or not user.is_active:
            _raise_auth_error("invalid", request)
        new_raw = await issue_web_session_token(db, user.id, label="auto-migrated")
        # Set the header directly on the injected Response — FastAPI merges these headers
        # into the final response. (A BaseHTTPMiddleware + contextvar approach does NOT
        # work: Starlette runs the downstream in a separate context, so values set in this
        # dependency don't propagate back up to the middleware.)
        response.headers["X-Auto-Issued-Token"] = new_raw
        log.info(
            "[tcms.auth] auto-migrated mock token for user_id=%s ip=%s",
            user.id,
            request.client.host if request.client else "?",
        )
        return user

    _raise_auth_error("missing", request)


def require_role(*roles: str):
    """Returns a dependency that 403s if the current user's role is not in `roles`."""
    allowed = set(roles)

    async def _check(request: Request, user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            _raise_auth_error("forbidden", request, status_code=403)
        return user

    return _check


async def record_audit(
    db: AsyncSession,
    request: Request,
    actor: Optional[User],
    action: str,
    resource_type: str,
    resource_id: Optional[str | int] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Append a row to tcms_audit_logs. Best-effort; never raises into the request path."""
    try:
        db.add(
            AuditLog(
                actor_id=actor.id if actor else None,
                actor_role=actor.role if actor else None,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id is not None else None,
                ip=request.client.host if request.client else None,
                user_agent=(request.headers.get("user-agent") or "")[:255] or None,
                metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
            )
        )
        await db.commit()
    except Exception:  # pragma: no cover — never block a real action on audit failure
        log.exception("[tcms.audit] failed to write audit row action=%s", action)
