from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "KK TCMS 1.5 API"
    DATABASE_URL: str = "sqlite+aiosqlite:///./tcms_1_5.db"

    class Config:
        env_file = ".env"

settings = Settings()
