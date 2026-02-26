from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.db.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.auth import UserLogin, UserPasswordReset, UserChangePassword
import hashlib

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

router = APIRouter()

@router.get("/", response_model=List[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    user_data = user.model_dump(exclude={"password"})
    db_user = User(**user_data)
    
    if user.password:
        db_user.hashed_password = hash_password(user.password)
        db_user.force_change_password = False
    else:
        db_user.hashed_password = hash_password("1234")
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
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Frontend pre-hashes password using SHA-256, compare directly
    if not user.hashed_password or user.hashed_password != login_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is disabled")
        
    return {
        "access_token": "mock-jwt-token-for-now",
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role,
        "require_password_change": user.force_change_password
    }

@router.post("/reset-password")
async def reset_password(reset_data: UserPasswordReset, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == reset_data.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # new_password is already SHA-256 hashed by the client
    user.hashed_password = reset_data.new_password
    user.force_change_password = False
    await db.commit()
    
    return {"message": "Password updated successfully"}

@router.post("/change-password")
async def change_password(change_data: UserChangePassword, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, change_data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # new_password is already SHA-256 hashed by the client
    user.hashed_password = change_data.new_password
    user.force_change_password = False
    await db.commit()
    return {"message": "Password changed successfully"}

@router.post("/{user_id}/reset-default")
async def reset_default_password(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # SHA-256 of '1234'
    DEFAULT_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    user.hashed_password = DEFAULT_HASH
    user.force_change_password = True
    await db.commit()
    return {"message": "Password reset to default (1234)"}

@router.post("/migrate-passwords")
async def migrate_all_passwords(db: AsyncSession = Depends(get_db)):
    # Set all existing users to default 1234. Quick endpoint for the migration.
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    DEFAULT_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    for u in users:
        u.hashed_password = DEFAULT_HASH
        u.force_change_password = True
        
    await db.commit()
    return {"message": f"Migrated {len(users)} users"}

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, user_update: UserUpdate, db: AsyncSession = Depends(get_db)):
    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.delete("/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    db_user = await db.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(db_user)
    await db.commit()
    return {"message": "User deleted"}
