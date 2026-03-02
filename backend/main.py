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

    # 初始化資料庫
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized.")

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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

# Mount static files for user uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/api/v1/uploads/static", StaticFiles(directory="uploads"), name="uploads_static")

app.include_router(api_router, prefix="/api/v1")
