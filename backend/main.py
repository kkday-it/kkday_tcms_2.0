from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    # X-Auto-Issued-Token is set directly by get_current_user via the injected Response;
    # expose it so the browser (PR-2 axios interceptor) can read it cross-origin.
    expose_headers=["Content-Disposition", "X-Auto-Issued-Token"],
)

@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

# Ensure the upload directory exists at startup. Files are *served* by a normal
# route (GET /api/v1/uploads/static/{filename} in app.api.uploads), NOT a
# Starlette StaticFiles mount: with root_path="/tcms" set, app.mount() sub-apps
# fail to match behind the reverse proxy (regular routes work, mounts 404), which
# made every uploaded mindmap/image return 404 even though the file was on disk.
os.makedirs("uploads", exist_ok=True)

app.include_router(api_router, prefix="/api/v1")

# ── Serve the built frontend (single-container mode) ──────────────────────────
# The Vite build (frontend/dist) is copied into FRONTEND_DIST at image-build time
# by the root-level Dockerfile. When that directory is absent (e.g. the legacy
# two-container image, or bare `uvicorn` dev), this block is skipped and the app
# runs API-only — so the change is backward compatible.
#
# We serve via a normal catch-all route rather than app.mount(StaticFiles(...)):
# with root_path="/tcms" set, Starlette mounts stop matching behind the reverse
# proxy (the same issue documented for uploads above). A regular route shares the
# API's routing path and resolves correctly at "/" and "/tcms" alike.
FRONTEND_DIST = os.environ.get("FRONTEND_DIST", "static")

if os.path.isdir(FRONTEND_DIST):
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    _DIST_ROOT = os.path.realpath(FRONTEND_DIST)
    _INDEX = os.path.join(_DIST_ROOT, "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # /api/* is owned by the routers registered above; never fall through to
        # the SPA (the routers match first, but guard defensively for 404s).
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        # Serve a real asset (js/css/img) when it exists inside the dist dir;
        # otherwise hand back index.html so client-side routing takes over.
        candidate = os.path.realpath(os.path.join(_DIST_ROOT, full_path))
        if (
            full_path
            and os.path.commonpath([_DIST_ROOT, candidate]) == _DIST_ROOT
            and os.path.isfile(candidate)
        ):
            return FileResponse(candidate)
        return FileResponse(_INDEX)

    logger.info("Frontend static serving enabled from %s", _DIST_ROOT)
else:
    logger.info("No frontend dist at '%s' — running API-only.", FRONTEND_DIST)
