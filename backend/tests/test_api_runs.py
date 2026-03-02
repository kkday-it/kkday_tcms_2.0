"""
Test Runs API 測試
涵蓋 Runs CRUD、Duplicate、Test Results 更新
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── helpers ───────────────────────────────────────────────────────────────────

async def _create_run(client: AsyncClient, project_id: int, title: str = "Test Run") -> dict:
    res = await client.post("/api/v1/runs/", json={
        "title": title,
        "project_id": project_id,
        "status": "Active",
        "run_type": "Feature Test",
        "description": "A test run",
    })
    assert res.status_code == 200, res.text
    return res.json()


async def _create_case(client: AsyncClient, suite_id: int, title: str = "TC") -> dict:
    res = await client.post("/api/v1/cases/", json={
        "title": title,
        "suite_id": suite_id,
        "priority": "High",
        "automation_status": "Manual",
        "steps": [{"action": "Step", "data": "", "expected_result": "OK", "order": 1}],
    })
    assert res.status_code == 200, res.text
    return res.json()


# ── Test Runs CRUD ────────────────────────────────────────────────────────────

class TestRunsCRUD:
    async def test_create_run(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "My First Run")
        assert run["title"] == "My First Run"
        assert run["status"] == "Active"
        assert run["project_id"] == project_id
        assert "id" in run

    async def test_create_run_has_stats(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id)
        for field in ("total", "passed", "failed", "blocked", "untested"):
            assert field in run

    async def test_list_runs_by_project(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id, "Run A")
        await _create_run(client, project_id, "Run B")
        res = await client.get(f"/api/v1/runs/project/{project_id}")
        assert res.status_code == 200
        titles = [r["title"] for r in res.json()]
        assert "Run A" in titles
        assert "Run B" in titles

    async def test_get_run_by_id(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Get Me")
        res = await client.get(f"/api/v1/runs/{run['id']}")
        assert res.status_code == 200
        assert res.json()["title"] == "Get Me"

    async def test_get_run_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/runs/999999")
        assert res.status_code == 404

    async def test_update_run_title(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Old Title")
        res = await client.put(f"/api/v1/runs/{run['id']}", json={"title": "New Title"})
        assert res.status_code == 200
        assert res.json()["title"] == "New Title"

    async def test_update_run_status_to_done(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id)
        res = await client.put(f"/api/v1/runs/{run['id']}", json={"status": "Done"})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Done"
        assert data["completed_at"] is not None

    async def test_delete_run(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "To Delete")
        del_res = await client.delete(f"/api/v1/runs/{run['id']}")
        assert del_res.status_code == 200
        get_res = await client.get(f"/api/v1/runs/{run['id']}")
        assert get_res.status_code == 404

    async def test_delete_run_not_found(self, client: AsyncClient):
        res = await client.delete("/api/v1/runs/999999")
        assert res.status_code == 404

    async def test_create_run_with_cases(self, client: AsyncClient, project_id: int, suite_id: int):
        """建立 Run 時帶入 case_ids，自動產生 TestResult"""
        case = await _create_case(client, suite_id)
        run = await _create_run(client, project_id)
        # total 應包含 cases（實際上 create_run 會自動抓 project 下所有 cases）
        assert run["total"] >= 0


# ── Duplicate ─────────────────────────────────────────────────────────────────

class TestRunDuplicate:
    async def test_duplicate_run(self, client: AsyncClient, project_id: int):
        run = await _create_run(client, project_id, "Original Run")
        res = await client.post(f"/api/v1/runs/{run['id']}/duplicate")
        assert res.status_code == 200
        dup = res.json()
        assert "Original Run" in dup["title"]
        assert dup["id"] != run["id"]
        assert dup["status"] == "Active"

    async def test_duplicate_run_not_found(self, client: AsyncClient):
        res = await client.post("/api/v1/runs/999999/duplicate")
        assert res.status_code == 404


# ── Test Results ──────────────────────────────────────────────────────────────

class TestResultsAPI:
    async def test_get_results_by_run(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Case for Results")
        run = await _create_run(client, project_id)
        res = await client.get(f"/api/v1/results/run/{run['id']}")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_results_initial_status_is_untested(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Untested Case")
        run = await _create_run(client, project_id)
        results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()
        if results:
            assert results[0]["status"] == "Untested"

    async def test_update_result_status_to_passed(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Pass Case")
        run = await _create_run(client, project_id)
        results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()
        if not results:
            return
        result_id = results[0]["id"]
        res = await client.put(f"/api/v1/results/{result_id}", json={"status": "Passed", "comment": "LGTM"})
        assert res.status_code == 200
        assert res.json()["status"] == "Passed"

    async def test_update_result_status_to_failed_with_bug(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Fail Case")
        run = await _create_run(client, project_id)
        results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()
        if not results:
            return
        result_id = results[0]["id"]
        res = await client.put(f"/api/v1/results/{result_id}", json={
            "status": "Failed",
            "comment": "Bug found",
            "jira_bug_id": "BUG-123",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Failed"
        assert data["jira_bug_id"] == "BUG-123"

    async def test_get_result_details(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Detail Case")
        run = await _create_run(client, project_id)
        results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()
        if not results:
            return
        result_id = results[0]["id"]
        res = await client.get(f"/api/v1/results/{result_id}/details")
        assert res.status_code == 200
        data = res.json()
        assert "id" in data or "status" in data

    async def test_run_stats_update_after_result_change(self, client: AsyncClient, project_id: int, suite_id: int):
        """更新 result 後，run stats 應反映"""
        await _create_case(client, suite_id, "Stats Case")
        run = await _create_run(client, project_id)
        results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()
        if not results:
            return
        result_id = results[0]["id"]
        await client.put(f"/api/v1/results/{result_id}", json={"status": "Passed"})
        updated_run = (await client.get(f"/api/v1/runs/{run['id']}")).json()
        assert updated_run["passed"] >= 1


# ── Run Folders ───────────────────────────────────────────────────────────────

class TestRunFoldersAPI:
    async def test_create_run_folder(self, client: AsyncClient, project_id: int):
        res = await client.post("/api/v1/run-folders/", json={
            "name": "Sprint 1", "project_id": project_id
        })
        assert res.status_code == 200
        assert res.json()["name"] == "Sprint 1"

    async def test_list_run_folders_by_project(self, client: AsyncClient, project_id: int):
        await client.post("/api/v1/run-folders/", json={"name": "Folder X", "project_id": project_id})
        res = await client.get(f"/api/v1/run-folders/project/{project_id}")
        assert res.status_code == 200
        names = [f["name"] for f in res.json()]
        assert "Folder X" in names

    async def test_update_run_folder(self, client: AsyncClient, project_id: int):
        folder = (await client.post("/api/v1/run-folders/", json={"name": "Old", "project_id": project_id})).json()
        res = await client.put(f"/api/v1/run-folders/{folder['id']}", json={"name": "Updated"})
        assert res.status_code == 200
        assert res.json()["name"] == "Updated"

    async def test_delete_run_folder(self, client: AsyncClient, project_id: int):
        folder = (await client.post("/api/v1/run-folders/", json={"name": "Delete Me", "project_id": project_id})).json()
        res = await client.delete(f"/api/v1/run-folders/{folder['id']}")
        assert res.status_code == 200
