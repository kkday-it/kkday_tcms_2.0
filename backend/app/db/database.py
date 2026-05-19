import logging
from urllib.parse import quote_plus, urlsplit, urlunsplit
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.config import settings, use_local_db

logger = logging.getLogger(__name__)


def _redact_db_url(url: str) -> str:
    """Strip password before logging — keep dialect/host/dbname only."""
    try:
        parts = urlsplit(url)
        if parts.password:
            netloc = parts.hostname or ""
            if parts.username:
                netloc = f"{parts.username}:***@{netloc}"
            if parts.port:
                netloc = f"{netloc}:{parts.port}"
            return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
        return url
    except Exception:
        return "<unparseable>"


def _resolve_database_url() -> str:
    """解析 DATABASE_URL：USE_LOCAL_DB=False 時改從 get_secret(key="qa_database") 取得。"""
    if use_local_db():
        return settings.DATABASE_URL

    from app.core.secrets import get_secret

    try:
        data = get_secret(key="qa_database", return_value=True)
    except Exception as e:
        raise ValueError(f"get_secret failed: {e}")

    if not data or not isinstance(data, dict):
        raise ValueError("get_secret failed: USE_LOCAL_DB=false 但 qa_database 無資料")

    user = data.get("user", "")
    pw = data.get("password", "") or data.get("pass", "")
    host = data.get("host", "")
    port = data.get("port", 5432)
    db = data.get("database", "")
    return f"postgresql+asyncpg://{user}:{quote_plus(str(pw))}@{host}:{port}/{db}"


_db_url = _resolve_database_url()
logger.info(
    "[Config] DB mode=%s URL=%s",
    "local (DATABASE_URL)" if use_local_db() else "remote (get_secret qa_database)",
    _redact_db_url(_db_url),
)

engine = create_async_engine(_db_url, echo=True)
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Local-dev workaround: legacy alembic DDL stores `DEFAULT (now())` (a PostgreSQL
# convention) on many tcms_* timestamp columns. SQLite has no built-in `now()`
# function so any INSERT that relies on those defaults blows up. Register a UDF
# on every sqlite3 connection so existing schemas still resolve. Postgres path
# is untouched.
if engine.dialect.name == "sqlite":
    from sqlalchemy import event
    from datetime import datetime, timezone

    @event.listens_for(engine.sync_engine, "connect")
    def _register_sqlite_now(dbapi_connection, _):
        dbapi_connection.create_function(
            "now", 0,
            lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
