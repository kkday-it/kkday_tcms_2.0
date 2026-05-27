"""API token CRUD — modeled after GitHub PAT.

Raw token strings are only ever returned at creation time; the DB stores SHA-256 hashes.
Users can list / revoke their own tokens but never see the raw string of an existing one.
"""
from __future__ import annotations

import datetime as _dt
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user, utcnow
from app.core.security import generate_api_token, hash_api_token
from app.db.database import get_db
from app.models.api_token import ApiToken
from app.models.user import User
from app.schemas.api_token import (
    ApiTokenCreate,
    ApiTokenCreateResponse,
    ApiTokenResponse,
)

router = APIRouter()


@router.post("/", response_model=ApiTokenCreateResponse)
async def create_token(
    body: ApiTokenCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw = generate_api_token()
    expires_at = None
    if body.expires_in_days is not None:
        if body.expires_in_days <= 0:
            raise HTTPException(status_code=400, detail="expires_in_days must be positive")
        expires_at = utcnow() + _dt.timedelta(days=body.expires_in_days)
    token = ApiToken(
        user_id=user.id,
        token_hash=hash_api_token(raw),
        label=body.label,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return ApiTokenCreateResponse(
        id=token.id,
        label=token.label,
        created_at=token.created_at,
        last_used_at=token.last_used_at,
        expires_at=token.expires_at,
        token=raw,
    )


@router.get("/", response_model=List[ApiTokenResponse])
async def list_my_tokens(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ApiToken)
        .where(ApiToken.user_id == user.id)
        .order_by(ApiToken.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{token_id}")
async def revoke_token(
    token_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token = await db.get(ApiToken, token_id)
    if not token or token.user_id != user.id:
        # Hide existence of other users' tokens — same 404 either way.
        raise HTTPException(status_code=404, detail="Token not found")
    await db.delete(token)
    await db.commit()
    return {"message": "Token revoked"}
