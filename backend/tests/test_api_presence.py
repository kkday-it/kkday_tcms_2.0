"""
Presence API 測試
涵蓋 heartbeat / online 快照、去重、以及 Admin 踢人（權限、自踢、token 失效）。

認證走 grace-period 路徑：帶 `Authorization: Bearer mock-jwt-token-for-now`
+ `X-User-Id: <id>`，get_current_user 會以 DB 內的 User 認證（見 app/api/deps.py）。

DB：本模組自帶一個 StaticPool 的 in-memory SQLite engine，並覆寫 get_db。
StaticPool 讓「app 請求」與「測試直接開的 session（建使用者 / 查 token）」共用同一條
連線、同一個 :memory: DB——conftest 預設的 engine 不共用連線，跨 session 會看不到資料表。
"""

import allure
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.future import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import LEGACY_MOCK_TOKEN, utcnow
from app.db.database import Base, get_db
from app.models.api_token import ApiToken
from app.models.user import User
from app.services import presence
from main import app
from tests.conftest import override_get_db

pytestmark = pytest.mark.asyncio

# Single shared connection so the app and the test's own sessions see one DB.
_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _presence_db():
    """Point get_db at the shared-connection engine for the duration of each test,
    create a fresh schema, and restore conftest's default afterwards."""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def _override():
        async with _Session() as session:
            yield session

    app.dependency_overrides[get_db] = _override
    presence._seen.clear()
    try:
        yield
    finally:
        presence._seen.clear()
        app.dependency_overrides[get_db] = override_get_db
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _make_user(username: str, role: str = "QA") -> int:
    """Insert a User row directly (POST /users/ is RBAC-gated) and return its id."""
    async with _Session() as session:
        user = User(
            username=username,
            full_name=username.title(),
            email=f"{username}@example.com",
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user.id


def _auth(user_id: int) -> dict:
    """Grace-period auth headers for a given user id."""
    return {"Authorization": f"Bearer {LEGACY_MOCK_TOKEN}", "X-User-Id": str(user_id)}


# ── heartbeat / online ─────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("Presence")
@allure.story("Heartbeat / Online")
class TestPresenceHeartbeat:
    async def test_heartbeat_requires_auth(self, client: AsyncClient):
        res = await client.post("/api/v1/presence/heartbeat")
        assert res.status_code == 401, res.text

    async def test_heartbeat_registers_user(self, client: AsyncClient):
        uid = await _make_user("alice")
        res = await client.post("/api/v1/presence/heartbeat", headers=_auth(uid))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["online"] == 1
        # 剛 heartbeat → 立即活躍,idle=False (snapshot 含 idle 旗標供前端上橘點)
        assert body["users"] == [{"id": uid, "username": "alice", "idle": False}]

    async def test_heartbeat_is_idempotent_per_user(self, client: AsyncClient):
        uid = await _make_user("bob")
        for _ in range(3):
            res = await client.post("/api/v1/presence/heartbeat", headers=_auth(uid))
            assert res.status_code == 200
        assert res.json()["online"] == 1

    async def test_online_counts_distinct_users_sorted(self, client: AsyncClient):
        carol = await _make_user("carol")
        dave = await _make_user("dave")
        await client.post("/api/v1/presence/heartbeat", headers=_auth(dave))
        await client.post("/api/v1/presence/heartbeat", headers=_auth(carol))

        res = await client.get("/api/v1/presence/online", headers=_auth(carol))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["online"] == 2
        # snapshot() sorts by username
        assert [u["username"] for u in body["users"]] == ["carol", "dave"]

    async def test_online_requires_auth(self, client: AsyncClient):
        res = await client.get("/api/v1/presence/online")
        assert res.status_code == 401, res.text


# ── kick ─────────────────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("Presence")
@allure.story("Admin kick")
class TestPresenceKick:
    async def test_admin_kick_drops_user(self, client: AsyncClient):
        admin = await _make_user("admin1", role="Admin")
        target = await _make_user("victim")
        await client.post("/api/v1/presence/heartbeat", headers=_auth(admin))
        await client.post("/api/v1/presence/heartbeat", headers=_auth(target))

        res = await client.post(f"/api/v1/presence/kick/{target}", headers=_auth(admin))
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["online"] == 1
        assert [u["id"] for u in body["users"]] == [admin]

    async def test_admin_kick_expires_target_tokens(self, client: AsyncClient):
        admin = await _make_user("admin2", role="Admin")
        target = await _make_user("tokenholder")
        # target's heartbeat auto-mints a real ApiToken via the grace path
        await client.post("/api/v1/presence/heartbeat", headers=_auth(target))

        res = await client.post(f"/api/v1/presence/kick/{target}", headers=_auth(admin))
        assert res.status_code == 200, res.text

        async with _Session() as session:
            rows = (
                await session.execute(select(ApiToken).where(ApiToken.user_id == target))
            ).scalars().all()
        assert rows, "expected the target to hold at least one token"
        # SQLite stores tz-naive; compare against a naive 'now'. All tokens should
        # now be expired (expires_at <= now).
        now_naive = utcnow().replace(tzinfo=None)
        for row in rows:
            assert row.expires_at is not None
            assert row.expires_at <= now_naive

    async def test_cannot_kick_self(self, client: AsyncClient):
        admin = await _make_user("admin3", role="Admin")
        res = await client.post(f"/api/v1/presence/kick/{admin}", headers=_auth(admin))
        assert res.status_code == 400, res.text

    async def test_kick_unknown_user_404(self, client: AsyncClient):
        admin = await _make_user("admin4", role="Admin")
        res = await client.post("/api/v1/presence/kick/999999", headers=_auth(admin))
        assert res.status_code == 404, res.text

    async def test_non_admin_cannot_kick(self, client: AsyncClient):
        qa = await _make_user("qa1", role="QA")
        target = await _make_user("qa2", role="QA")
        res = await client.post(f"/api/v1/presence/kick/{target}", headers=_auth(qa))
        assert res.status_code == 403, res.text
