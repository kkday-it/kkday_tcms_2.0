"""Presence API — backs the "站上人數" (online users) sidebar widget.

POST /presence/heartbeat   — the frontend pings this on a timer; it refreshes the
                             caller's last-seen and returns the live count so one
                             request both updates and reads (no second round-trip).
GET  /presence/online      — read-only snapshot (count + users).
POST /presence/kick/{id}   — Admin-only. Boots a user: expires all their API tokens
                             (so the next request 401s and the frontend bounces them
                             to /login) and drops them from the online set. No row is
                             deleted — they can simply log back in (zero-delete, per
                             .ai_rules.md). Caveat: during the auth grace period a user
                             still on the legacy mock token could re-auth via deps.py
                             Path 2; that path is removed after 2026-06-13.

heartbeat/online require auth via get_current_user (grace-period compatible).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user, record_audit, require_role, utcnow
from app.db.database import get_db
from app.models.api_token import ApiToken
from app.models.user import User
from app.services import presence

router = APIRouter()


@router.post("/heartbeat")
async def heartbeat(current_user: User = Depends(get_current_user)):
    presence.touch(current_user.id, current_user.username)
    return presence.snapshot()


@router.get("/online")
async def online(current_user: User = Depends(get_current_user)):
    return presence.snapshot()


@router.post("/kick/{user_id}")
async def kick(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_role("Admin")),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能踢自己下線")

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="找不到該使用者")

    # Expire (not delete) every token this user holds → next request 401s.
    now = utcnow()
    tokens = (
        await db.execute(select(ApiToken).where(ApiToken.user_id == user_id))
    ).scalars().all()
    for t in tokens:
        t.expires_at = now
    await db.commit()

    presence.drop(user_id)
    await record_audit(
        db, request, current_user, "presence.kick", "user", user_id,
        metadata={"target_username": target.username, "tokens_expired": len(tokens)},
    )
    return presence.snapshot()
