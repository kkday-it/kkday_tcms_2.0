import asyncio
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import SessionLocal
from app.models.user import User

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

async def update_passwords():
    async with SessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        for user in users:
            user.hashed_password = hash_password("1234")
            user.force_change_password = True
        
        await db.commit()
        print(f"Updated {len(users)} users with default password '1234' and force_change_password=True")

if __name__ == "__main__":
    asyncio.run(update_passwords())
