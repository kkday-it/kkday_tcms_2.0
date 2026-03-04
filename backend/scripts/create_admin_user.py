#!/usr/bin/env python3
"""
建立 TCMS Admin 使用者

Usage:
    # 預設：admin@example.com / admin / 1234
    python scripts/create_admin_user.py

    # 自訂 email、username、密碼
    python scripts/create_admin_user.py --email lance.chien@kkday.com --username lance --password 1234
"""
import argparse
import asyncio
import hashlib
import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parents[1]
os.chdir(_root)
sys.path.insert(0, str(_root))

# 載入 .env
_env = _root / ".env"
if _env.exists():
    from dotenv import load_dotenv
    load_dotenv(_env)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def main():
    parser = argparse.ArgumentParser(description="Create TCMS Admin user")
    parser.add_argument("--email", default="admin@example.com", help="Email")
    parser.add_argument("--username", default="admin", help="Username")
    parser.add_argument("--full-name", default="Admin", help="Full name")
    parser.add_argument("--password", default="1234", help="Password (plain text)")
    args = parser.parse_args()

    from app.db.database import AsyncSessionLocal
    from app.models.user import User
    from sqlalchemy.future import select

    async with AsyncSessionLocal() as db:
        # 檢查是否已存在
        result = await db.execute(
            select(User).where(
                (User.email == args.email) | (User.username == args.username)
            )
        )
        existing = result.scalars().first()
        if existing:
            print(f"User already exists: {existing.email} (id={existing.id}, role={existing.role})")
            if existing.role != "Admin":
                existing.role = "Admin"
                await db.commit()
                print("  -> Updated role to Admin")
            return 0

        user = User(
            username=args.username,
            full_name=args.full_name,
            email=args.email,
            role="Admin",
            hashed_password=hash_password(args.password),
            is_active=True,
            force_change_password=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"Created Admin user: {user.email} (id={user.id})")
        print(f"  Login: {user.email} / {args.password}")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
