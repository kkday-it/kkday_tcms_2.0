"""
Test Plans API 測試
涵蓋 Plans CRUD、Plan Folders、linked runs/cases
"""

import allure
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

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Test Plan CRUD")
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
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "Archived"

    async def test_delete_plan_not_found(self, client: AsyncClient):
        res = await client.delete("/api/v1/plans/999999")
        assert res.status_code == 404


# ── Linked Runs & Cases ───────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Plan 關聯 Run/Case")
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

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Plan Folder CRUD")
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


# ── Clone ─────────────────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Plan Clone")
class TestPlanClone:
    async def test_clone_creates_new_plan(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Original Plan")
        res = await client.post(f"/api/v1/plans/{plan['id']}/clone")
        assert res.status_code == 200
        cloned = res.json()
        assert cloned["id"] != plan["id"]

    async def test_clone_title_has_suffix(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id, "Sprint Plan")
        cloned = (await client.post(f"/api/v1/plans/{plan['id']}/clone")).json()
        assert cloned["title"] == "Sprint Plan (複製)"

    async def test_clone_status_reset_to_draft(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        await client.put(f"/api/v1/plans/{plan['id']}", json={"status": "Active"})
        cloned = (await client.post(f"/api/v1/plans/{plan['id']}/clone")).json()
        assert cloned["status"] == "Draft"

    async def test_clone_copies_linked_runs(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Run A")
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan with Run", "project_id": project_id, "status": "Draft", "run_ids": [run["id"]],
        })).json()
        cloned = (await client.post(f"/api/v1/plans/{plan['id']}/clone")).json()
        assert run["id"] in cloned["run_ids"]

    async def test_clone_copies_linked_cases(self, client: AsyncClient, project_id: int, suite_id: int):
        case = await _create_case(client, suite_id)
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan with Case", "project_id": project_id, "status": "Draft", "case_ids": [case["id"]],
        })).json()
        cloned = (await client.post(f"/api/v1/plans/{plan['id']}/clone")).json()
        assert case["id"] in cloned["case_ids"]

    async def test_clone_not_found(self, client: AsyncClient):
        res = await client.post("/api/v1/plans/999999/clone")
        assert res.status_code == 404

    async def test_clone_records_history_with_actor(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        cloned = (await client.post(f"/api/v1/plans/{plan['id']}/clone", headers={"X-User-Id": "42"})).json()
        history_res = await client.get(f"/api/v1/plans/{cloned['id']}/history")
        assert any(h["user_id"] == 42 for h in history_res.json())


# ── Plan Runs Summary ─────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Plan Runs Summary")
class TestPlanRunsSummary:
    async def test_get_plan_runs_empty(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/{plan['id']}/runs")
        assert res.status_code == 200
        assert res.json() == []

    async def test_get_plan_runs_returns_linked_runs(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Linked Run")
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan", "project_id": project_id, "status": "Draft", "run_ids": [run["id"]],
        })).json()
        res = await client.get(f"/api/v1/plans/{plan['id']}/runs")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["id"] == run["id"]
        assert data[0]["title"] == "Linked Run"

    async def test_get_plan_runs_has_stats_fields(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id)
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan", "project_id": project_id, "status": "Draft", "run_ids": [run["id"]],
        })).json()
        res = await client.get(f"/api/v1/plans/{plan['id']}/runs")
        item = res.json()[0]
        assert "passed" in item
        assert "failed" in item
        assert "untested" in item
        assert "status" in item

    async def test_get_plan_runs_excludes_unlinked(self, client: AsyncClient, project_id: int):
        run_linked = await _create_run(client, project_id, "Linked")
        await _create_run(client, project_id, "Unlinked")
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan", "project_id": project_id, "status": "Draft", "run_ids": [run_linked["id"]],
        })).json()
        res = await client.get(f"/api/v1/plans/{plan['id']}/runs")
        ids = [r["id"] for r in res.json()]
        assert run_linked["id"] in ids
        assert len(ids) == 1


# ── cases_data in plan response ───────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Plan cases_data")
class TestPlanCasesData:
    async def test_plan_response_includes_cases_data(self, client: AsyncClient, project_id: int, suite_id: int):
        case = await _create_case(client, suite_id)
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan", "project_id": project_id, "status": "Draft", "case_ids": [case["id"]],
        })).json()
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert "cases_data" in res.json()

    async def test_cases_data_contains_required_fields(self, client: AsyncClient, project_id: int, suite_id: int):
        case = await _create_case(client, suite_id)
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Plan", "project_id": project_id, "status": "Draft", "case_ids": [case["id"]],
        })).json()
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        cases_data = res.json()["cases_data"]
        assert len(cases_data) == 1
        assert cases_data[0]["id"] == case["id"]
        assert "title" in cases_data[0]
        assert "priority" in cases_data[0]

    async def test_cases_data_empty_when_no_cases(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert res.json()["cases_data"] == []


# ── X-User-Id → actor_id ──────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("Actor ID from header")
class TestActorId:
    async def test_create_plan_default_actor(self, client: AsyncClient, project_id: int):
        """未帶 X-User-Id header 時，history user_id fallback 為 1"""
        plan = await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/{plan['id']}/history")
        assert res.status_code == 200
        assert res.json()[0]["user_id"] == 1

    async def test_create_plan_custom_actor(self, client: AsyncClient, project_id: int):
        """帶 X-User-Id: 99，history user_id 應為 99"""
        res = await client.post("/api/v1/plans/", json={
            "title": "Actor Test", "project_id": project_id, "status": "Draft",
        }, headers={"X-User-Id": "99"})
        plan = res.json()
        history_res = await client.get(f"/api/v1/plans/{plan['id']}/history")
        assert history_res.json()[0]["user_id"] == 99

    async def test_update_plan_records_actor(self, client: AsyncClient, project_id: int):
        plan = await _create_plan(client, project_id)
        await client.put(f"/api/v1/plans/{plan['id']}", json={"title": "Updated"},
                         headers={"X-User-Id": "7"})
        history_res = await client.get(f"/api/v1/plans/{plan['id']}/history")
        user_ids = [h["user_id"] for h in history_res.json()]
        assert 7 in user_ids


# ── KQT-14444: 多個 Jira Filter IDs ──────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試計畫管理")
@allure.story("多 Jira Filter IDs")
class TestPlanJiraFilterIds:
    async def test_create_plan_with_jira_unfix_filter_ids(self, client: AsyncClient, project_id: int):
        """建立計劃時可設定多個 unfix filter ID"""
        res = await client.post("/api/v1/plans/", json={
            "title": "Multi Filter Plan",
            "project_id": project_id,
            "status": "Draft",
            "jira_unfix_filter_ids": [18523, 18524, 18525],
        })
        assert res.status_code == 200
        plan = res.json()
        assert plan["jira_unfix_filter_ids"] == [18523, 18524, 18525]

    async def test_create_plan_with_jira_total_filter_ids(self, client: AsyncClient, project_id: int):
        """建立計劃時可設定多個 total filter ID"""
        res = await client.post("/api/v1/plans/", json={
            "title": "Total Filter Plan",
            "project_id": project_id,
            "status": "Draft",
            "jira_total_filter_ids": [11111, 22222],
        })
        assert res.status_code == 200
        plan = res.json()
        assert plan["jira_total_filter_ids"] == [11111, 22222]

    async def test_plan_response_includes_filter_ids_fields(self, client: AsyncClient, project_id: int):
        """plan response 必須包含 jira_unfix_filter_ids / jira_total_filter_ids 欄位"""
        plan = await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert res.status_code == 200
        data = res.json()
        assert "jira_unfix_filter_ids" in data
        assert "jira_total_filter_ids" in data

    async def test_create_plan_filter_ids_default_null(self, client: AsyncClient, project_id: int):
        """未設定時 filter IDs 應為 null"""
        plan = await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/{plan['id']}")
        data = res.json()
        assert data["jira_unfix_filter_ids"] is None
        assert data["jira_total_filter_ids"] is None

    async def test_update_plan_jira_filter_ids(self, client: AsyncClient, project_id: int):
        """更新計劃可修改 filter ID 清單"""
        plan = await _create_plan(client, project_id)
        res = await client.put(f"/api/v1/plans/{plan['id']}", json={
            "jira_unfix_filter_ids": [100, 200],
            "jira_total_filter_ids": [300],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["jira_unfix_filter_ids"] == [100, 200]
        assert data["jira_total_filter_ids"] == [300]

    async def test_update_plan_clear_filter_ids(self, client: AsyncClient, project_id: int):
        """更新計劃可清空 filter ID 清單"""
        plan = (await client.post("/api/v1/plans/", json={
            "title": "Clear Filter Plan",
            "project_id": project_id,
            "status": "Draft",
            "jira_unfix_filter_ids": [18523],
        })).json()
        res = await client.put(f"/api/v1/plans/{plan['id']}", json={
            "jira_unfix_filter_ids": None,
        })
        assert res.status_code == 200
        get_res = await client.get(f"/api/v1/plans/{plan['id']}")
        assert get_res.json()["jira_unfix_filter_ids"] is None

    async def test_plan_preserves_single_filter_id_alongside_ids(self, client: AsyncClient, project_id: int):
        """舊的 single filter ID 與新的 filter IDs 可並存"""
        res = await client.post("/api/v1/plans/", json={
            "title": "Compat Plan",
            "project_id": project_id,
            "status": "Draft",
            "jira_unfix_filter_id": 18523,
            "jira_unfix_filter_ids": [18523, 18524],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["jira_unfix_filter_id"] == 18523
        assert data["jira_unfix_filter_ids"] == [18523, 18524]
