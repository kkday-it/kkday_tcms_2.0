import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 優先從環境變數讀取 DATABASE_URL，或 USE_LOCAL_DB=false 時從 qa_database 取得
# 舊 USE_QA_DATABASE_SECRET 仍 honor，process 起來會印 DeprecationWarning
# SQLite:     sqlite+aiosqlite:///./data/tcms_1_5.db
# PostgreSQL: postgresql+asyncpg://user:pass@host:5432/dbname
from app.core.config import env_use_local_db

_db_url: str | None = os.environ.get("DATABASE_URL")
if not env_use_local_db():
    from app.core.secrets import get_secret
    from urllib.parse import quote_plus
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
    _db_url = f"postgresql+asyncpg://{user}:{quote_plus(str(pw))}@{host}:{port}/{db}"
if _db_url:
    # Alembic 使用同步 driver，將 async driver 前綴替換成同步版
    _sync_url = (
        _db_url
        .replace("sqlite+aiosqlite", "sqlite")
        .replace("postgresql+asyncpg", "postgresql+psycopg2")
    )
    config.set_main_option("sqlalchemy.url", _sync_url)

# add your model's MetaData object here
# for 'autogenerate' support
import app.models
import app.models.test_plan_folder
import app.models.test_plan
from app.db.database import Base
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
