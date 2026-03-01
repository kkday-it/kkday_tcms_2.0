"""
pytest fixtures：使用獨立的 in-memory SQLite，不影響正式資料庫
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    """每個測試前建立 schema，測試後清除"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def project_id(client: AsyncClient) -> int:
    """建立一個測試用 Project，回傳 project_id"""
    res = await client.post("/api/v1/projects/", json={"name": "Test Project", "description": "Unit test project"})
    assert res.status_code == 200, res.text
    return res.json()["id"]


@pytest_asyncio.fixture
async def suite_id(client: AsyncClient, project_id: int) -> int:
    """建立一個測試用 Suite，回傳 suite_id"""
    res = await client.post("/api/v1/suites/", json={"name": "Test Suite", "project_id": project_id})
    assert res.status_code == 200, res.text
    return res.json()["id"]
