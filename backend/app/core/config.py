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


_TRUTHY = ("true", "1", "yes")
_FALSY = ("false", "0", "no")


def _parse_db_flag(legacy: Optional[bool], current: Optional[bool]) -> bool:
    """
    Pure function. 把「舊 flag USE_QA_DATABASE_SECRET」與「新 flag USE_LOCAL_DB」
    兩個值收斂為單一的「是否使用本機 DATABASE_URL」布林。

    規則：
      1. 若舊名有值（非 None）→ 印 DeprecationWarning，回傳 `not legacy`
         （兩者並存時舊名優先，reflect 既有部署現況，方便逐步 migration）。
      2. 否則回傳新名值；新名也沒值就預設 True（本機友善）。

    返回 True → 用 settings.DATABASE_URL（local / 自帶 host）。
    返回 False → 透過 get_secret("qa_database") 組 postgres 連線。
    """
    if legacy is not None:
        warnings.warn(
            "USE_QA_DATABASE_SECRET is deprecated; rename to USE_LOCAL_DB "
            "(USE_LOCAL_DB = not USE_QA_DATABASE_SECRET).",
            DeprecationWarning,
            stacklevel=3,
        )
        return not legacy
    return True if current is None else current


def _parse_env_bool(name: str) -> Optional[bool]:
    """讀環境變數並 normalise 為 Optional[bool]；無法判讀 / 未設定皆回 None。"""
    raw = os.environ.get(name, "").lower()
    if raw in _TRUTHY:
        return True
    if raw in _FALSY:
        return False
    return None


def use_local_db() -> bool:
    """
    給 runtime / 一般 caller 用：透過 pydantic Settings 取值並交由 _parse_db_flag 收斂。
    語意對等 env_use_local_db。
    """
    return _parse_db_flag(settings.USE_QA_DATABASE_SECRET, settings.USE_LOCAL_DB)


def env_use_local_db() -> bool:
    """
    給 alembic env.py、log dir 等不依賴 pydantic Settings 的 caller 用：純讀
    os.environ。語意對等 use_local_db。
    """
    return _parse_db_flag(_parse_env_bool("USE_QA_DATABASE_SECRET"), _parse_env_bool("USE_LOCAL_DB"))
