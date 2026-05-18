import os
import warnings
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "KK TCMS 1.5 API"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tcms_1_5.db"

    # True（預設）→ 直接用 DATABASE_URL（本機 SQLite / 自帶 postgres）。
    # False → 從 secret service 抓 qa_database（EC2 / docker prod 部署）。
    USE_LOCAL_DB: bool = True

    # Deprecated 別名，行為與 USE_LOCAL_DB 相反。仍 honor 既有 .env / 部署設定，
    # 啟動時 process 第一次解析會印 DeprecationWarning。新環境請改用 USE_LOCAL_DB。
    USE_QA_DATABASE_SECRET: Optional[bool] = None

    # Secret service (same as QA-automation autotest-service)
    SECRET_SERVICE_URL: Optional[str] = None   # e.g. http://autotest-service.sit.kkday.com
    SERVICE_URL: Optional[str] = None          # fallback alias (QA-automation 使用此名)
    AUTOMATION_TOKEN: Optional[str] = None    # Bearer token for secret API

    # Jira
    JIRA_HOST: str = "https://kkday.atlassian.net"

    # Dify Knowledge Base 設定
    DIFY_BASE_URL: Optional[str] = None        # e.g. https://dify.example.com
    DIFY_API_KEY: Optional[str] = None         # Knowledge Base API Key
    DIFY_DATASET_ID: Optional[str] = None      # Knowledge Base (Dataset) ID

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_OAUTH_REDIRECT_URI: Optional[str] = None
    # After successful Google login, redirect browser to this frontend base URL
    FRONTEND_BASE_URL: str = "/tcms/"

    # ASGI root_path for reverse proxy (e.g. "/tcms"); set "" for local dev
    ROOT_PATH: str = "/tcms"

    class Config:
        env_file = ".env"
        extra = "ignore"  # 忽略 .env 中未定義的 key

settings = Settings()


def use_local_db() -> bool:
    """
    決定本次 process 要用本機 DATABASE_URL 還是去 secret service 拿 qa_database。

    USE_LOCAL_DB 為主來源；USE_QA_DATABASE_SECRET 為已棄用的舊名，仍 honor 但
    印 DeprecationWarning。兩者皆指定時舊名優先（reflect 既有部署現況），方便
    逐步 migration。

    返回 True → 用 settings.DATABASE_URL（local / 自帶 host）。
    返回 False → 透過 get_secret("qa_database") 組 postgres 連線。
    """
    if settings.USE_QA_DATABASE_SECRET is not None:
        warnings.warn(
            "USE_QA_DATABASE_SECRET is deprecated; rename to USE_LOCAL_DB "
            "(USE_LOCAL_DB = not USE_QA_DATABASE_SECRET).",
            DeprecationWarning,
            stacklevel=2,
        )
        return not settings.USE_QA_DATABASE_SECRET
    return settings.USE_LOCAL_DB


def env_use_local_db() -> bool:
    """
    僅讀 os.environ 而不依賴 pydantic Settings 的版本 — 給 alembic env.py 與
    log dir 解析這類在 settings 載入之前/之外的 caller 使用。語意同 use_local_db()。
    """
    legacy = os.environ.get("USE_QA_DATABASE_SECRET", "").lower()
    if legacy in ("true", "1", "yes"):
        warnings.warn(
            "USE_QA_DATABASE_SECRET=true is deprecated; set USE_LOCAL_DB=false instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return False
    if legacy in ("false", "0", "no"):
        warnings.warn(
            "USE_QA_DATABASE_SECRET=false is deprecated; set USE_LOCAL_DB=true instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return True
    current = os.environ.get("USE_LOCAL_DB", "").lower()
    if current in ("false", "0", "no"):
        return False
    return True  # default → local
