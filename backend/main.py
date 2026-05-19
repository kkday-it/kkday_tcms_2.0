from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.database import engine, Base
from app.api.api import router as api_router

# 確保所有 model 都被 SQLAlchemy 注冊
import app.models.test_plan_folder  # noqa: F401
import app.models.test_plan         # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 啟動 ──────────────────────────────────────────────
    logger.info("Starting up FastAPI server...")

    # 資料庫健康檢查 (取代之前的自動 create_all)
    from app.db.health import check_schema_health
    is_healthy, missing_tables, missing_columns = await check_schema_health()
    if not is_healthy:
        logger.warning(f"Database schema mismatch detected! Missing tables: {missing_tables}, Missing columns: {missing_columns}")
        logger.warning("Please run manual sync or migrations.")
    else:
        logger.info("Database schema is healthy.")

    # ── Safe column migrations (idempotent) ───────────────────────────────
    # Add columns that were introduced after initial table creation.
    # Uses IF NOT EXISTS equivalent: catch error if column already exists.
    try:
        async with engine.begin() as conn:
            # PostgreSQL: use DO block to add columns only if they don't exist
            db_url = str(engine.url)
            if "postgresql" in db_url or "asyncpg" in db_url:
                await conn.execute(
                    __import__("sqlalchemy").text(
                        """
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_name='tcms_users' AND column_name='google_id'
                            ) THEN
                                ALTER TABLE tcms_users ADD COLUMN google_id VARCHAR UNIQUE;
                            END IF;

                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_name='tcms_test_plans' AND column_name='ued_docs'
                            ) THEN
                                ALTER TABLE tcms_test_plans ADD COLUMN ued_docs JSON;
                                ALTER TABLE tcms_test_plans ADD COLUMN qa_docs JSON;
                                ALTER TABLE tcms_test_plans ADD COLUMN mindmap_url TEXT;
                            END IF;

                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_name='tcms_test_plans' AND column_name='jira_unfix_filter_ids'
                            ) THEN
                                ALTER TABLE tcms_test_plans ADD COLUMN jira_unfix_filter_ids JSONB;
                                ALTER TABLE tcms_test_plans ADD COLUMN jira_total_filter_ids JSONB;
                            END IF;
                        END $$;
                        """
                    )
                )
            else:
                # SQLite: try to add, ignore if exists
                try:
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_users ADD COLUMN google_id VARCHAR UNIQUE"))
                except Exception:
                    pass
                try:
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_test_plans ADD COLUMN ued_docs JSON"))
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_test_plans ADD COLUMN qa_docs JSON"))
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_test_plans ADD COLUMN mindmap_url TEXT"))
                except Exception:
                    pass
                try:
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_test_plans ADD COLUMN jira_unfix_filter_ids JSON"))
                    await conn.execute(__import__("sqlalchemy").text("ALTER TABLE tcms_test_plans ADD COLUMN jira_total_filter_ids JSON"))
                except Exception:
                    pass
        logger.info("Column migration complete (google_id & test_plan docs check).")
    except Exception as e:
        logger.warning(f"Column migration warning (non-fatal): {e}")

    # 啟動定期備份排程
    try:
        from app.services.backup_scheduler import init_scheduler
        init_scheduler()
    except Exception as e:
        logger.warning(f"APScheduler init failed (non-fatal): {e}")

    yield

    # ── 關閉 ──────────────────────────────────────────────
    try:
        from app.services.backup_scheduler import shutdown_scheduler
        shutdown_scheduler()
        logger.info("APScheduler shut down.")
    except Exception:
        pass

    await engine.dispose()
    logger.info("Server shutdown complete.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    description="Backend API for KK TCMS 1.5",
    version="1.5.0",
    lifespan=lifespan,
    root_path=settings.ROOT_PATH,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

# Mount static files for user uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/api/v1/uploads/static", StaticFiles(directory="uploads"), name="uploads_static")

app.include_router(api_router, prefix="/api/v1")
