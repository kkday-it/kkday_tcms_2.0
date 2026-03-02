"""
Users API 測試
涵蓋 Users CRUD、登入、改密碼、重設密碼
"""

import hashlib
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

DEFAULT_PASSWORD = "Passw0rd!"
DEFAULT_PASSWORD_HASH = hashlib.sha256(DEFAULT_PASSWORD.encode()).hexdigest()


# ── helpers ───────────────────────────────────────────────────────────────────

async def _create_user(client: AsyncClient, username: str = "testuser", role: str = "QA") -> dict:
    res = await client.post("/api/v1/users/", json={
        "username": username,
        "full_name": "Test User",
        "email": f"{username}@example.com",
        "role": role,
        "password": DEFAULT_PASSWORD,
    })
    assert res.status_code == 200, res.text
    return res.json()


# ── Users CRUD ────────────────────────────────────────────────────────────────

class TestUsersCRUD:
    async def test_create_user(self, client: AsyncClient):
        user = await _create_user(client, "alice")
        assert user["username"] == "alice"
        assert user["role"] == "QA"
        assert "id" in user
        assert "password" not in user  # 密碼不應回傳

    async def test_create_user_admin(self, client: AsyncClient):
        user = await _create_user(client, "adminuser", role="Admin")
        assert user["role"] == "Admin"

    async def test_list_users(self, client: AsyncClient):
        await _create_user(client, "bob")
        res = await client.get("/api/v1/users/")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        usernames = [u["username"] for u in res.json()]
        assert "bob" in usernames

    async def test_get_user_by_id(self, client: AsyncClient):
        user = await _create_user(client, "charlie")
        res = await client.get(f"/api/v1/users/{user['id']}")
        assert res.status_code == 200
        assert res.json()["username"] == "charlie"

    async def test_get_user_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/users/999999")
        assert res.status_code == 404

    async def test_update_user_fullname(self, client: AsyncClient):
        user = await _create_user(client, "dave")
        res = await client.put(f"/api/v1/users/{user['id']}", json={
            "username": "dave", "full_name": "Dave Updated", "email": "dave@example.com", "role": "QA"
        })
        assert res.status_code == 200
        assert res.json()["full_name"] == "Dave Updated"

    async def test_update_user_role(self, client: AsyncClient):
        user = await _create_user(client, "eve")
        res = await client.put(f"/api/v1/users/{user['id']}", json={
            "username": "eve", "full_name": "Eve", "email": "eve@example.com", "role": "Admin"
        })
        assert res.status_code == 200
        assert res.json()["role"] == "Admin"

    async def test_delete_user(self, client: AsyncClient):
        user = await _create_user(client, "frank")
        del_res = await client.delete(f"/api/v1/users/{user['id']}")
        assert del_res.status_code == 200
        get_res = await client.get(f"/api/v1/users/{user['id']}")
        assert get_res.status_code == 404

    async def test_delete_user_not_found(self, client: AsyncClient):
        res = await client.delete("/api/v1/users/999999")
        assert res.status_code == 404

    async def test_duplicate_username_returns_error(self, client: AsyncClient):
        await _create_user(client, "gina")
        res = await client.post("/api/v1/users/", json={
            "username": "gina",
            "full_name": "Gina 2",
            "email": "gina2@example.com",
            "role": "QA",
            "password": DEFAULT_PASSWORD,
        })
        assert res.status_code in (400, 409, 422, 500)


# ── Login ─────────────────────────────────────────────────────────────────────

class TestUsersLogin:
    async def test_login_success(self, client: AsyncClient):
        """登入時密碼需先由 client 做 SHA-256，再傳給 API；回傳 JWT token"""
        await _create_user(client, "loginuser")
        res = await client.post("/api/v1/users/login", json={
            "email": "loginuser@example.com",
            "password": DEFAULT_PASSWORD_HASH,
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert "user_id" in data

    async def test_login_returns_role_and_user_id(self, client: AsyncClient):
        user = await _create_user(client, "infouser")
        data = (await client.post("/api/v1/users/login", json={
            "email": "infouser@example.com",
            "password": DEFAULT_PASSWORD_HASH,
        })).json()
        assert data["role"] == "QA"
        assert data["user_id"] == user["id"]

    async def test_login_wrong_password(self, client: AsyncClient):
        await _create_user(client, "wrongpw")
        res = await client.post("/api/v1/users/login", json={
            "email": "wrongpw@example.com",
            "password": "deadbeef",
        })
        assert res.status_code in (400, 401, 403)

    async def test_login_nonexistent_user(self, client: AsyncClient):
        res = await client.post("/api/v1/users/login", json={
            "email": "nosuchuser@example.com",
            "password": DEFAULT_PASSWORD_HASH,
        })
        assert res.status_code in (400, 401, 404)


# ── Password Operations ───────────────────────────────────────────────────────

class TestUsersPassword:
    async def test_reset_default_password(self, client: AsyncClient):
        user = await _create_user(client, "resetme")
        res = await client.post(f"/api/v1/users/{user['id']}/reset-default")
        assert res.status_code == 200

    async def test_change_password_success(self, client: AsyncClient):
        """UserChangePassword 使用 user_id + new_password（client 端自行 hash）"""
        user = await _create_user(client, "changepw")
        new_hash = hashlib.sha256("NewPassw0rd!".encode()).hexdigest()
        res = await client.post("/api/v1/users/change-password", json={
            "user_id": user["id"],
            "new_password": new_hash,
        })
        assert res.status_code == 200

    async def test_change_password_user_not_found(self, client: AsyncClient):
        res = await client.post("/api/v1/users/change-password", json={
            "user_id": 999999,
            "new_password": DEFAULT_PASSWORD_HASH,
        })
        assert res.status_code == 404


# ── Projects CRUD (complete) ──────────────────────────────────────────────────

class TestProjectsCompleteCRUD:
    async def test_get_project_by_id(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/projects/{project_id}")
        assert res.status_code == 200
        assert res.json()["id"] == project_id

    async def test_get_project_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/projects/999999")
        assert res.status_code == 404

    async def test_update_project(self, client: AsyncClient, project_id: int):
        res = await client.put(f"/api/v1/projects/{project_id}", json={"name": "Renamed Project"})
        assert res.status_code == 200
        assert res.json()["name"] == "Renamed Project"

    async def test_delete_project(self, client: AsyncClient):
        proj = (await client.post("/api/v1/projects/", json={"name": "Temp Project"})).json()
        del_res = await client.delete(f"/api/v1/projects/{proj['id']}")
        assert del_res.status_code == 200
        get_res = await client.get(f"/api/v1/projects/{proj['id']}")
        assert get_res.status_code == 404


# ── Suites CRUD (complete) ────────────────────────────────────────────────────

class TestSuitesCompleteCRUD:
    async def test_get_suite_by_id(self, client: AsyncClient, suite_id: int):
        res = await client.get(f"/api/v1/suites/{suite_id}")
        assert res.status_code == 200
        assert res.json()["id"] == suite_id

    async def test_get_suite_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/suites/999999")
        assert res.status_code == 404

    async def test_update_suite_name(self, client: AsyncClient, project_id: int, suite_id: int):
        res = await client.put(f"/api/v1/suites/{suite_id}", json={"name": "Renamed Suite", "project_id": project_id})
        assert res.status_code == 200
        assert res.json()["name"] == "Renamed Suite"

    async def test_delete_suite(self, client: AsyncClient, project_id: int):
        suite = (await client.post("/api/v1/suites/", json={"name": "Temp Suite", "project_id": project_id})).json()
        del_res = await client.delete(f"/api/v1/suites/{suite['id']}")
        assert del_res.status_code == 200
