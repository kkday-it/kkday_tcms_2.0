from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.api.deps import get_current_user, issue_web_session_token, record_audit, require_role
from app.core.security import hash_password, is_legacy_sha256, verify_password
from app.db.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.auth import UserLogin, UserPasswordReset, UserChangePassword


router = APIRouter()

@router.get("/", response_model=List[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin"))):
    user_data = user.model_dump(exclude={"password"})
    db_user = User(**user_data)
    
    # Frontend pre-hashes with SHA-256; we wrap that with bcrypt for storage.
    # For the default-password branch we hash the same constant the frontend would have
    # produced for "1234", so verify_password works either way.
    SHA256_OF_1234 = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
    if user.password:
        db_user.hashed_password = hash_password(user.password)
        db_user.force_change_password = False
    else:
        db_user.hashed_password = hash_password(SHA256_OF_1234)
        db_user.force_change_password = True

    db.add(db_user)
    try:
        await db.commit()
        await db.refresh(db_user)
        return db_user
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already exists")

@router.post("/login")
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalars().first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is disabled")

    # Record the successful login. func.now() resolves server-side on flush,
    # matching how created_at is populated.
    user.last_login = func.now()

    # Transparent password migration: re-hash legacy SHA-256 rows with bcrypt on first
    # successful login. login_data.password is the SHA-256 from the frontend pre-hash;
    # wrapping it with bcrypt keeps verify_password working without changing the client.
    if is_legacy_sha256(user.hashed_password):
        user.hashed_password = hash_password(login_data.password)

    await db.commit()

    # Issue a real bearer token (7-day web-session). Replaces the old hardcoded
    # "mock-jwt-token-for-now" — clients should send `Authorization: Bearer <token>`
    # on subsequent requests once the dependency rollout (PR-3) enforces it.
    access_token = await issue_web_session_token(db, user.id, label="web-session")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role,
        "require_password_change": user.force_change_password,
    }

@router.post("/reset-password")
async def reset_password(reset_data: UserPasswordReset, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == reset_data.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Client sends SHA-256; bcrypt-wrap before storage.
    user.hashed_password = hash_password(reset_data.new_password)
    user.force_change_password = False
    await db.commit()

    return {"message": "Password updated successfully"}

@router.post("/change-password")
async def change_password(
    change_data: UserChangePassword,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    # Ownership guard (code review #802): the body carries user_id but a
    # logged-in user must only be able to change their own password, unless
    # they're an Admin (admin paths exist via /reset-default but explicitly
    # going through change-password as Admin is still fine).
    if actor.id != change_data.user_id and actor.role != "Admin":
        raise HTTPException(status_code=403, detail="只能修改自己的密碼;如需協助請聯絡 Admin。")

    user = await db.get(User, change_data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Client sends SHA-256; bcrypt-wrap before storage.
    user.hashed_password = hash_password(change_data.new_password)
    user.force_change_password = False
    await db.commit()
    return {"message": "Password changed successfully"}

@router.post("/{user_id}/reset-default")
async def reset_default_password(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin")),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # SHA-256 of '1234', then bcrypt-wrapped (matches the frontend pre-hash flow).
    SHA256_OF_1234 = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
    user.hashed_password = hash_password(SHA256_OF_1234)
    user.force_change_password = True
    await db.commit()
    await record_audit(
        db, request, actor,
        action="reset_user_password",
        resource_type="user",
        resource_id=user_id,
    )
    return {"message": "Password reset to default (1234)"}

@router.post("/migrate-passwords")
async def migrate_all_passwords(
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin")),
):
    # Set all existing users to default 1234. Quick endpoint for the migration.
    result = await db.execute(select(User))
    users = result.scalars().all()

    SHA256_OF_1234 = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
    default_hash = hash_password(SHA256_OF_1234)
    for u in users:
        u.hashed_password = default_hash
        u.force_change_password = True

    await db.commit()
    await record_audit(
        db, request, actor,
        action="migrate_all_passwords",
        resource_type="user",
        resource_id=None,
    )
    return {"message": f"Migrated {len(users)} users"}

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin")),
):
    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)

    await db.commit()
    await db.refresh(db_user)
    await record_audit(
        db, request, actor,
        action="update_user",
        resource_type="user",
        resource_id=user_id,
    )
    return db_user

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin")),
):
    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(db_user)
    await db.commit()
    await record_audit(
        db, request, actor,
        action="delete_user",
        resource_type="user",
        resource_id=user_id,
    )
    return {"message": "User deleted"}
