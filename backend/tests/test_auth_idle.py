"""Web-session idle-timeout 測試 (deps.get_current_user)。

驗證重點:
- web-session token 閒置超過門檻 → 401 idle_expired
- web-session token 仍在門檻內 → 放行
- API token (label 非 web-session) 即使閒置很久也不受影響
- 背景輪詢 (X-TCMS-Activity: background) 不會更新 last_used_at(不續命),前景請求才會

走 Path 1 真實 bearer token。DB 用 StaticPool 共用連線,讓「app 請求」與「測試直接
開的 session」看到同一個 :memory: DB(同 test_api_presence 的理由)。
"""

import datetime as _dt

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.future import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import deps
from app.api.deps import utcnow
from app.core.security import generate_api_token, hash_api_token
from app.db.database import Base, get_db
from app.models.api_token import ApiToken
from app.models.user import User
from main import app
from tests.conftest import override_get_db

pytestmark = pytest.mark.asyncio

_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _idle_db():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def _override():
        async with _Session() as session:
            yield session

    app.dependency_overrides[get_db] = _override
    try:
        yield
    finally:
        app.dependency_overrides[get_db] = override_get_db
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


async def _make_user(username: str = "alice", role: str = "QA") -> int:
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


async def _make_token(
    user_id: int,
    label: str,
    last_used_minutes_ago: int | None,
    expires_in_days: float | None = None,
) -> str:
    """Create a token row and return the raw token. last_used_at is set to N minutes
    ago, or left NULL when last_used_minutes_ago is None. expires_at is set N days out
    when expires_in_days is given, or left NULL otherwise."""
    raw = generate_api_token()
    last_used = (
        None
        if last_used_minutes_ago is None
        else utcnow() - _dt.timedelta(minutes=last_used_minutes_ago)
    )
    expires_at = (
        None
        if expires_in_days is None
        else utcnow() + _dt.timedelta(days=expires_in_days)
    )
    async with _Session() as session:
        session.add(
            ApiToken(
                user_id=user_id,
                token_hash=hash_api_token(raw),
                label=label,
                last_used_at=last_used,
                expires_at=expires_at,
            )
        )
        await session.commit()
    return raw


def _bearer(raw: str, background: bool = False) -> dict:
    headers = {"Authorization": f"Bearer {raw}"}
    if background:
        headers["X-TCMS-Activity"] = "background"
    return headers


async def _last_used(raw: str) -> _dt.datetime | None:
    async with _Session() as session:
        row = (
            await session.execute(
                select(ApiToken).where(ApiToken.token_hash == hash_api_token(raw))
            )
        ).scalar_one()
        return row.last_used_at


async def _expires_at(raw: str) -> _dt.datetime | None:
    async with _Session() as session:
        row = (
            await session.execute(
                select(ApiToken).where(ApiToken.token_hash == hash_api_token(raw))
            )
        ).scalar_one()
        return row.expires_at


class TestWebSessionIdle:
    async def test_idle_web_session_is_logged_out(self, client: AsyncClient):
        uid = await _make_user("idleuser")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=deps.WEB_SESSION_IDLE_MINUTES + 5)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw))
        assert res.status_code == 401, res.text
        assert res.json()["detail"]["error"] == "tcms_token_idle_expired"

    async def test_active_web_session_passes(self, client: AsyncClient):
        uid = await _make_user("activeuser")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=1)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw))
        assert res.status_code == 200, res.text

    async def test_auto_migrated_label_also_subject_to_idle(self, client: AsyncClient):
        uid = await _make_user("graceuser")
        raw = await _make_token(uid, "auto-migrated", last_used_minutes_ago=deps.WEB_SESSION_IDLE_MINUTES + 5)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw))
        assert res.status_code == 401, res.text

    async def test_api_token_is_exempt_from_idle(self, client: AsyncClient):
        """非 web-session label 的 token (bot/CI) 閒置再久也不該被踢。"""
        uid = await _make_user("botuser")
        raw = await _make_token(uid, "ci-bot", last_used_minutes_ago=deps.WEB_SESSION_IDLE_MINUTES * 100)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw))
        assert res.status_code == 200, res.text

    async def test_null_last_used_is_not_idle(self, client: AsyncClient):
        """剛登入、尚未有任何前景請求 (last_used_at = NULL) 不應被當成閒置。"""
        uid = await _make_user("freshuser")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=None)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw))
        assert res.status_code == 200, res.text


class TestBackgroundPollDoesNotKeepAlive:
    async def test_background_poll_does_not_update_last_used(self, client: AsyncClient):
        uid = await _make_user("bguser")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=30)
        before = await _last_used(raw)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw, background=True))
        assert res.status_code == 200, res.text
        after = await _last_used(raw)
        assert after == before  # 背景輪詢不續命

    async def test_foreground_request_updates_last_used(self, client: AsyncClient):
        uid = await _make_user("fguser")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=30)
        before = await _last_used(raw)
        res = await client.get("/api/v1/presence/online", headers=_bearer(raw))
        assert res.status_code == 200, res.text
        after = await _last_used(raw)
        assert after > before  # 前景請求重置 idle 時鐘


class TestSlidingExpiration:
    """Sliding TTL: 前景請求把硬性 7 天過期往後推,使用中的人永遠不會被踢回 login。"""

    async def test_foreground_request_slides_expiry_for_web_session(self, client: AsyncClient):
        uid = await _make_user("slideuser")
        # Token minted 1 day out — a foreground hit should push it to ~now + TTL.
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=1, expires_in_days=1)
        before = await _expires_at(raw)
        res = await client.get("/api/v1/presence/online", headers=_bearer(raw))
        assert res.status_code == 200, res.text
        after = await _expires_at(raw)
        assert after > before  # 過期時間被往後推
        # 推到接近 now + WEB_SESSION_TTL_DAYS(給點時鐘誤差容忍)。SQLite 回傳 naive
        # datetime,比照 production 用 _as_aware_utc 正規化後再比。
        after_aware = deps._as_aware_utc(after)
        expected = utcnow() + _dt.timedelta(days=deps.WEB_SESSION_TTL_DAYS)
        assert abs((after_aware - expected).total_seconds()) < 60

    async def test_background_poll_does_not_slide_expiry(self, client: AsyncClient):
        uid = await _make_user("slidebg")
        raw = await _make_token(uid, "web-session", last_used_minutes_ago=1, expires_in_days=1)
        before = await _expires_at(raw)
        res = await client.post("/api/v1/presence/heartbeat", headers=_bearer(raw, background=True))
        assert res.status_code == 200, res.text
        after = await _expires_at(raw)
        assert after == before  # 背景輪詢不續期

    async def test_api_token_expiry_not_slid(self, client: AsyncClient):
        """長效 API token (非 web-session) 的 expires_at 不該被前景請求覆蓋。"""
        uid = await _make_user("slidebot")
        raw = await _make_token(uid, "ci-bot", last_used_minutes_ago=1, expires_in_days=1)
        before = await _expires_at(raw)
        res = await client.get("/api/v1/presence/online", headers=_bearer(raw))
        assert res.status_code == 200, res.text
        after = await _expires_at(raw)
        assert after == before  # bot token 維持原本的 expires_at
