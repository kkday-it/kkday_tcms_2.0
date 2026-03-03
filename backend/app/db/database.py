from urllib.parse import quote_plus
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.config import settings


def _resolve_database_url() -> str:
    """解析 DATABASE_URL：若 USE_QA_DATABASE_SECRET=True，僅從 get_secret(key="qa_database") 取得。"""
    if getattr(settings, "USE_QA_DATABASE_SECRET", False):
        from app.core.secrets import get_secret

        data = get_secret(key="qa_database", return_value=True)
        if not data or not isinstance(data, dict):
            raise ValueError("USE_QA_DATABASE_SECRET=true 但 get_secret(key='qa_database') 無資料")
        user = data.get("user", "")
        pw = data.get("password", "") or data.get("pass", "")
        host = data.get("host", "")
        port = data.get("port", 5432)
        db = data.get("database", "")
        return f"postgresql+asyncpg://{user}:{quote_plus(str(pw))}@{host}:{port}/{db}"
    return settings.DATABASE_URL


engine = create_async_engine(_resolve_database_url(), echo=True)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
