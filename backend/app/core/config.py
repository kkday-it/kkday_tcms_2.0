from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "KK TCMS 1.5 API"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tcms_1_5.db"

    # Dify Knowledge Base 設定
    DIFY_BASE_URL: Optional[str] = None        # e.g. https://dify.example.com
    DIFY_API_KEY: Optional[str] = None         # Knowledge Base API Key
    DIFY_DATASET_ID: Optional[str] = None      # Knowledge Base (Dataset) ID

    class Config:
        env_file = ".env"

settings = Settings()
