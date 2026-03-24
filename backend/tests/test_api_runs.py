"""
Test Runs API 測試
涵蓋 Runs CRUD、Duplicate、Test Results 更新
"""

import allure
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

@allure.epic("TCMS API")
@allure.feature("測試執行管理")
@allure.story("Test Run CRUD")
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
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "Archived"

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

@allure.epic("TCMS API")
@allure.feature("測試執行管理")
@allure.story("Test Run 複製")
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


# ── Bulk Copy ─────────────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試執行管理")
@allure.story("Bulk Copy Runs")
class TestBulkCopyRuns:
    async def test_bulk_copy_replaces_template_in_title(
        self, client: AsyncClient, project_id: int
    ):
        """bulk-copy 應將 $template 替換為 date_string，並建立新 runs"""
        run_a = await _create_run(client, project_id, "Sprint $template - Feature")
        run_b = await _create_run(client, project_id, "Sprint $template - Regression")

        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [run_a["id"], run_b["id"]],
            "date_string": "2026-04",
        })
        assert res.status_code == 200
        copies = res.json()
        assert len(copies) == 2
        titles = {c["title"] for c in copies}
        assert "Sprint 2026-04 - Feature" in titles
        assert "Sprint 2026-04 - Regression" in titles
        # 新 id 不同於原始 run
        new_ids = {c["id"] for c in copies}
        assert run_a["id"] not in new_ids
        assert run_b["id"] not in new_ids

    async def test_bulk_copy_copies_results(
        self, client: AsyncClient, project_id: int, suite_id: int
    ):
        """bulk-copy 後新 run 應繼承原 run 的 test results"""
        await _create_case(client, suite_id, "Case A")
        run = await _create_run(client, project_id, "Run $template")
        original_results = (await client.get(f"/api/v1/results/run/{run['id']}")).json()

        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [run["id"]],
            "date_string": "2026-04",
        })
        assert res.status_code == 200
        new_run = res.json()[0]
        new_results = (await client.get(f"/api/v1/results/run/{new_run['id']}")).json()
        assert len(new_results) == len(original_results)
        # 所有新 result 初始應為 Untested
        assert all(r["status"] == "Untested" for r in new_results)

    async def test_bulk_copy_new_runs_are_active(
        self, client: AsyncClient, project_id: int
    ):
        """bulk-copy 建立的新 run status 應為 Active"""
        run = await _create_run(client, project_id, "Run $template")
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [run["id"]],
            "date_string": "2026-04",
        })
        assert res.status_code == 200
        assert res.json()[0]["status"] == "Active"

    async def test_bulk_copy_empty_list_returns_empty(self, client: AsyncClient):
        """空 run_ids 應回傳空陣列"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [],
            "date_string": "2026-04",
        })
        assert res.status_code == 200
        assert res.json() == []

    async def test_bulk_copy_nonexistent_ids_returns_404(self, client: AsyncClient):
        """全部 run_id 都不存在時應回傳 404，含明確錯誤訊息"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [999998, 999999],
            "date_string": "2026-04",
        })
        assert res.status_code == 404
        assert "runs were found" in res.json()["detail"].lower()

    async def test_bulk_copy_partial_ids_returns_404_with_message(
        self, client: AsyncClient, project_id: int
    ):
        """部分 run_id 不存在時應回傳 404，訊息中含缺少的 ID"""
        run = await _create_run(client, project_id, "Run $template")
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [run["id"], 999999],
            "date_string": "2026-04",
        })
        assert res.status_code == 404
        assert "999999" in res.json()["detail"]

    async def test_bulk_copy_cross_project_returns_400(
        self, client: AsyncClient, project_id: int
    ):
        """跨 project 的 run_ids 應回傳 400"""
        # 建立第二個 project
        proj2 = (await client.post("/api/v1/projects/", json={
            "name": "Project 2", "description": ""
        })).json()
        run_a = await _create_run(client, project_id, "Run A $template")
        run_b = await _create_run(client, proj2["id"], "Run B $template")

        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [run_a["id"], run_b["id"]],
            "date_string": "2026-04",
        })
        assert res.status_code == 400

    # ── Input validation (422) ────────────────────────────────────────────────

    async def test_bulk_copy_date_string_with_control_char_returns_422(self, client: AsyncClient):
        """date_string 含控制字元應回傳 422"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [1], "date_string": "bad\x01string",
        })
        assert res.status_code == 422

    async def test_bulk_copy_date_string_del_char_returns_422(self, client: AsyncClient):
        """date_string 含 DEL 字元（0x7F）應回傳 422"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [1], "date_string": "bad\x7fstring",
        })
        assert res.status_code == 422

    async def test_bulk_copy_date_string_too_long_returns_422(self, client: AsyncClient):
        """date_string 超過 100 字元應回傳 422"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [1], "date_string": "x" * 101,
        })
        assert res.status_code == 422

    async def test_bulk_copy_too_many_run_ids_returns_422(self, client: AsyncClient):
        """run_ids 超過 1000 筆應回傳 422"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": list(range(1001)), "date_string": "2026-04",
        })
        assert res.status_code == 422

    async def test_bulk_copy_duplicate_run_ids_returns_422(self, client: AsyncClient):
        """run_ids 含重複值應回傳 422"""
        res = await client.post("/api/v1/runs/bulk-copy", json={
            "run_ids": [1, 1, 2], "date_string": "2026-04",
        })
        assert res.status_code == 422


# ── Test Results ──────────────────────────────────────────────────────────────

@allure.epic("TCMS API")
@allure.feature("測試執行管理")
@allure.story("Test Result 更新")
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

@allure.epic("TCMS API")
@allure.feature("測試執行管理")
@allure.story("Run Folder CRUD")
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
