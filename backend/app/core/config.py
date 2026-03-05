from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "KK TCMS 1.5 API"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tcms_1_5.db"
    USE_QA_DATABASE_SECRET: bool = False  # 若 True，從 get_secret(key="qa_database") 取得連線，取代 DATABASE_URL

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

    class Config:
        env_file = ".env"
        extra = "ignore"  # 忽略 .env 中未定義的 key

settings = Settings()
