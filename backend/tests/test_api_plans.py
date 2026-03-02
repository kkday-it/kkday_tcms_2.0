"""
Test Plans API 測試
涵蓋 Plans CRUD、Plan Folders、linked runs/cases
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── helpers ───────────────────────────────────────────────────────────────────

async def _create_plan(client: AsyncClient, project_id: int, title: str = "Test Plan") -> dict:
    res = await client.post("/api/v1/plans/", json={
        "title": title,
        "project_id": project_id,
        "status": "Draft",
        "description": "A test plan",
    })
    assert res.status_code == 200, res.text
    return res.json()


async def _create_run(client: AsyncClient, project_id: int, title: str = "Run") -> dict:
    res = await client.post("/api/v1/runs/", json={
        "title": title, "project_id": project_id, "status": "Active", "run_type": "Feature Test",
    })
    assert res.status_code == 200, res.text
    return res.json()


async def _create_case(client: AsyncClient, suite_id: int) -> dict:
    res = await client.post("/api/v1/cases/", json={
        "title": "Plan Case", "suite_id": suite_id, "priority": "Medium", "automation_status": "Manual",
    })
    assert res.status_code == 200, res.text
    return res.json()


# ── Plans CRUD ────────────────────────────────────────────────────────────────

class TestPlansCRUD:
    async def test_create_plan(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Sprint 1 Plan")
        assert plan["title"] == "Sprint 1 Plan"
        assert plan["status"] == "Draft"
        assert plan["project_id"] == project_id
        assert "id" in plan

    async def test_create_plan_has_linked_fields(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        assert "run_ids" in plan
        assert "case_ids" in plan

    async def test_list_plans_by_project(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id, "Plan A")
        await _create_plan(client, project_id, "Plan B")
        res = await client.get(f"/api/v1/plans/project/{project_id}")
        assert res.status_code == 200
        titles = [p["title"] for p in res.json()]
        assert "Plan A" in titles
        assert "Plan B" in titles

    async def test_get_plan_by_id(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Fetch Me")
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert res.status_code == 200
        assert res.json()["title"] == "Fetch Me"

    async def test_get_plan_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/plans/999999")
        assert res.status_code == 404

    async def test_update_plan_title(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Old Name")
        res = await client.put(f"/api/v1/plans/{plan['id']}", json={"title": "New Name"})
        assert res.status_code == 200
        assert res.json()["title"] == "New Name"

    async def test_update_plan_status(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        res = await client.put(f"/api/v1/plans/{plan['id']}", json={"status": "Active"})
        assert res.status_code == 200
        assert res.json()["status"] == "Active"

    async def test_delete_plan(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Delete Plan")
        del_res = await client.delete(f"/api/v1/plans/{plan['id']}")
        assert del_res.status_code == 200
        get_res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert get_res.status_code == 404

    async def test_delete_plan_not_found(self, client: AsyncClient):
        res = await client.delete("/api/v1/plans/999999")
        assert res.status_code == 404


# ── Linked Runs & Cases ───────────────────────────────────────────────────────

class TestPlanLinks:
    async def test_create_plan_with_linked_run(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Linked Run")
        res = await client.post("/api/v1/plans/", json={
            "title": "Plan with Run",
            "project_id": project_id,
            "status": "Draft",
            "run_ids": [run["id"]],
        })
        assert res.status_code == 200
        assert run["id"] in res.json()["run_ids"]

    async def test_create_plan_with_linked_case(self, client: AsyncClient, project_id: int, suite_id: int):
        case = await _create_case(client, suite_id)
        res = await client.post("/api/v1/plans/", json={
            "title": "Plan with Case",
            "project_id": project_id,
            "status": "Draft",
            "case_ids": [case["id"]],
        })
        assert res.status_code == 200
        assert case["id"] in res.json()["case_ids"]

    async def test_update_plan_links_run(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        run = await _create_run(client, project_id, "New Linked Run")
        put_res = await client.put(f"/api/v1/plans/{plan['id']}", json={"run_ids": [run["id"]]})
        assert put_res.status_code == 200
        # Verify with a fresh GET (new session avoids identity-map cache)
        get_res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert run["id"] in get_res.json()["run_ids"]

    async def test_update_plan_clear_links(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id)
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Clearable Plan", "project_id": project_id, "status": "Draft", "run_ids": [run["id"]],
        })).json()
        put_res = await client.put(f"/api/v1/plans/{plan['id']}", json={"run_ids": []})
        assert put_res.status_code == 200
        # Verify with a fresh GET (new session avoids identity-map cache)
        get_res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert get_res.json()["run_ids"] == []


# ── Plan Folders ──────────────────────────────────────────────────────────────

class TestPlanFoldersAPI:
    async def test_create_plan_folder(self, client: AsyncClient, project_id: int):
        res = await client.post("/api/v1/plan-folders/", json={
            "name": "Q1 Plans", "project_id": project_id
        })
        assert res.status_code == 200
        assert res.json()["name"] == "Q1 Plans"

    async def test_list_plan_folders_by_project(self, client: AsyncClient, project_id: int):
        await client.post("/api/v1/plan-folders/", json={"name": "Folder Alpha", "project_id": project_id})
        res = await client.get(f"/api/v1/plan-folders/project/{project_id}")
        assert res.status_code == 200
        names = [f["name"] for f in res.json()]
        assert "Folder Alpha" in names

    async def test_create_nested_plan_folder(self, client: AsyncClient, project_id: int):
        parent = (await client.post("/api/v1/plan-folders/", json={"name": "Parent", "project_id": project_id})).json()
        child = (await client.post("/api/v1/plan-folders/", json={
            "name": "Child", "project_id": project_id, "parent_id": parent["id"]
        })).json()
        assert child["parent_id"] == parent["id"]

    async def test_update_plan_folder(self, client: AsyncClient, project_id: int):
        folder = (await client.post("/api/v1/plan-folders/", json={"name": "Old", "project_id": project_id})).json()
        res = await client.put(f"/api/v1/plan-folders/{folder['id']}", json={"name": "Renamed"})
        assert res.status_code == 200
        assert res.json()["name"] == "Renamed"

    async def test_delete_plan_folder(self, client: AsyncClient, project_id: int):
        folder = (await client.post("/api/v1/plan-folders/", json={"name": "Delete Folder", "project_id": project_id})).json()
        res = await client.delete(f"/api/v1/plan-folders/{folder['id']}")
        assert res.status_code == 200
