"""
Test Cases API 測試
驗證原有 CRUD 功能與新增的 export 端點皆正常運作
"""

import allure
import pytest
from httpx import AsyncClient

from app.api.test_cases import EXTERNAL_ID_OFFSET, EXTERNAL_ID_PREFIX

pytestmark = pytest.mark.asyncio


@allure.epic("TCMS API")
@allure.feature("系統健康檢查")
class TestHealthCheck:
    @allure.title("GET /health 回傳 200 ok")
    @allure.severity(allure.severity_level.BLOCKER)
    async def test_health(self, client: AsyncClient):
        res = await client.get("/api/v1/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"


@allure.epic("TCMS API")
@allure.feature("專案管理")
class TestProjectsAPI:
    @allure.title("建立專案成功")
    @allure.severity(allure.severity_level.CRITICAL)
    async def test_create_project(self, client: AsyncClient):
        res = await client.post("/api/v1/projects/", json={"name": "My Project"})
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "My Project"
        assert "id" in data

    async def test_list_projects(self, client: AsyncClient, project_id: int):
        res = await client.get("/api/v1/projects/")
        assert res.status_code == 200
        assert any(p["id"] == project_id for p in res.json())


@allure.epic("TCMS API")
@allure.feature("測試套件管理")
class TestSuitesAPI:
    @allure.title("建立測試套件")
    @allure.severity(allure.severity_level.CRITICAL)
    async def test_create_suite(self, client: AsyncClient, project_id: int):
        res = await client.post("/api/v1/suites/", json={"name": "Suite A", "project_id": project_id})
        assert res.status_code == 200
        assert res.json()["name"] == "Suite A"

    async def test_create_nested_suite(self, client: AsyncClient, project_id: int, suite_id: int):
        res = await client.post("/api/v1/suites/", json={
            "name": "Child Suite",
            "project_id": project_id,
            "parent_suite_id": suite_id,
        })
        assert res.status_code == 200
        assert res.json()["parent_suite_id"] == suite_id

    async def test_list_suites_by_project(self, client: AsyncClient, project_id: int, suite_id: int):
        res = await client.get(f"/api/v1/suites/project/{project_id}")
        assert res.status_code == 200
        assert any(s["id"] == suite_id for s in res.json())


@allure.epic("TCMS API")
@allure.feature("測試案例管理")
class TestCasesAPI:
    @allure.title("建立測試案例（含步驟）")
    @allure.severity(allure.severity_level.CRITICAL)
    async def test_create_case(self, client: AsyncClient, suite_id: int):
        res = await client.post("/api/v1/cases/", json={
            "title": "Login with valid credentials",
            "suite_id": suite_id,
            "priority": "High",
            "automation_status": "Manual",
            "steps": [
                {"action": "Enter email", "data": "user@example.com", "expected_result": "Email accepted", "order": 1},
                {"action": "Click login", "data": "", "expected_result": "Redirected to dashboard", "order": 2},
            ],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "Login with valid credentials"
        assert data["priority"] == "High"
        assert len(data["steps"]) == 2

    async def test_get_case(self, client: AsyncClient, suite_id: int):
        create_res = await client.post("/api/v1/cases/", json={"title": "TC-Get", "suite_id": suite_id})
        case_id = create_res.json()["id"]

        res = await client.get(f"/api/v1/cases/{case_id}")
        assert res.status_code == 200
        assert res.json()["id"] == case_id

    async def test_get_case_not_found(self, client: AsyncClient):
        res = await client.get("/api/v1/cases/99999")
        assert res.status_code == 404

    async def test_update_case(self, client: AsyncClient, suite_id: int):
        create_res = await client.post("/api/v1/cases/", json={"title": "Old Title", "suite_id": suite_id})
        case_id = create_res.json()["id"]

        res = await client.put(f"/api/v1/cases/{case_id}", json={"title": "New Title", "priority": "Low"})
        assert res.status_code == 200
        data = res.json()
        assert data["title"] == "New Title"
        assert data["priority"] == "Low"

    async def test_delete_case(self, client: AsyncClient, suite_id: int):
        create_res = await client.post("/api/v1/cases/", json={"title": "To Delete", "suite_id": suite_id})
        case_id = create_res.json()["id"]

        del_res = await client.delete(f"/api/v1/cases/{case_id}")
        assert del_res.status_code == 200

        get_res = await client.get(f"/api/v1/cases/{case_id}")
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "Archived"

    async def test_list_cases_by_suite(self, client: AsyncClient, suite_id: int):
        await client.post("/api/v1/cases/", json={"title": "Case 1", "suite_id": suite_id})
        await client.post("/api/v1/cases/", json={"title": "Case 2", "suite_id": suite_id})

        res = await client.get(f"/api/v1/cases/suite/{suite_id}")
        assert res.status_code == 200
        assert len(res.json()) == 2

    async def test_list_cases_by_project(self, client: AsyncClient, project_id: int, suite_id: int):
        await client.post("/api/v1/cases/", json={"title": "Project Case", "suite_id": suite_id})

        res = await client.get(f"/api/v1/cases/project/{project_id}")
        assert res.status_code == 200
        assert len(res.json()) >= 1

    async def test_case_history(self, client: AsyncClient, suite_id: int):
        create_res = await client.post("/api/v1/cases/", json={"title": "History TC", "suite_id": suite_id})
        case_id = create_res.json()["id"]

        res = await client.get(f"/api/v1/cases/{case_id}/history")
        assert res.status_code == 200
        history = res.json()
        assert len(history) >= 1
        assert history[0]["action"] == "Created"

    async def test_labels_all(self, client: AsyncClient, suite_id: int):
        await client.post("/api/v1/cases/", json={
            "title": "Labelled Case",
            "suite_id": suite_id,
            "labels": '["regression", "smoke"]',
        })
        res = await client.get("/api/v1/cases/labels/all")
        assert res.status_code == 200
        assert "regression" in res.json()

    @allure.title("建立 case 時未提供 external_id，自動產生 KQT-T5xxxx")
    async def test_create_case_auto_generates_external_id(self, client: AsyncClient, suite_id: int):
        res = await client.post("/api/v1/cases/", json={"title": "Auto ID Case", "suite_id": suite_id})
        assert res.status_code == 200
        data = res.json()
        assert data["external_id"] is not None
        assert data["external_id"].startswith(EXTERNAL_ID_PREFIX)
        assert data["external_id"] == f"{EXTERNAL_ID_PREFIX}{EXTERNAL_ID_OFFSET + data['id']}"

    @allure.title("建立 case 時提供 external_id，保留原值不覆蓋")
    async def test_create_case_preserves_provided_external_id(self, client: AsyncClient, suite_id: int):
        res = await client.post("/api/v1/cases/", json={
            "title": "Zephyr Migrated Case",
            "suite_id": suite_id,
            "external_id": "KQT-T23248",
        })
        assert res.status_code == 200
        assert res.json()["external_id"] == "KQT-T23248"

    @allure.title("建立 case 時 external_id 為空字串，視同未提供，自動產生")
    async def test_create_case_empty_external_id_gets_auto_generated(self, client: AsyncClient, suite_id: int):
        res = await client.post("/api/v1/cases/", json={
            "title": "Empty External ID Case",
            "suite_id": suite_id,
            "external_id": "",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["external_id"] == f"{EXTERNAL_ID_PREFIX}{EXTERNAL_ID_OFFSET + data['id']}"

    @allure.title("建立 case 時 external_id 為空白字串，視同未提供，自動產生")
    async def test_create_case_whitespace_external_id_gets_auto_generated(self, client: AsyncClient, suite_id: int):
        res = await client.post("/api/v1/cases/", json={
            "title": "Whitespace External ID Case",
            "suite_id": suite_id,
            "external_id": "   ",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["external_id"] == f"{EXTERNAL_ID_PREFIX}{EXTERNAL_ID_OFFSET + data['id']}"

    @allure.title("建立多個 case 時，各自的 external_id 唯一且不重複")
    async def test_create_multiple_cases_have_unique_external_ids(self, client: AsyncClient, suite_id: int):
        res1 = await client.post("/api/v1/cases/", json={"title": "Case Alpha", "suite_id": suite_id})
        res2 = await client.post("/api/v1/cases/", json={"title": "Case Beta", "suite_id": suite_id})
        assert res1.status_code == 200
        assert res2.status_code == 200
        ext_id_1 = res1.json()["external_id"]
        ext_id_2 = res2.json()["external_id"]
        assert ext_id_1 != ext_id_2
        assert ext_id_1.startswith(EXTERNAL_ID_PREFIX)
        assert ext_id_2.startswith(EXTERNAL_ID_PREFIX)


@allure.epic("TCMS API")
@allure.feature("測試案例匯出")
class TestExportAPI:
    async def _create_case_with_steps(self, client: AsyncClient, suite_id: int, title: str):
        return await client.post("/api/v1/cases/", json={
            "title": title,
            "suite_id": suite_id,
            "priority": "High",
            "layer": "E2E",
            "tags": '["smoke"]',
            "steps": [
                {"action": "Step 1", "data": "data1", "expected_result": "result1", "order": 1},
            ],
        })

    async def test_export_csv(self, client: AsyncClient, project_id: int, suite_id: int):
        await self._create_case_with_steps(client, suite_id, "Export CSV Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=csv")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
        content = res.text
        assert "case_id" in content  # header 存在
        assert "Export CSV Case" in content

    async def test_export_json(self, client: AsyncClient, project_id: int, suite_id: int):
        await self._create_case_with_steps(client, suite_id, "Export JSON Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["title"] == "Export JSON Case"
        assert "steps" in data[0]

    async def test_export_ai_json(self, client: AsyncClient, project_id: int, suite_id: int):
        await self._create_case_with_steps(client, suite_id, "Export AI Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=ai_json")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        item = data[0]
        assert "text" in item
        assert "metadata" in item
        assert "Export AI Case" in item["text"]
        assert item["metadata"]["layer"] == "E2E"

    async def test_export_by_suite(self, client: AsyncClient, project_id: int, suite_id: int):
        await self._create_case_with_steps(client, suite_id, "Suite Filter Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&suite_id={suite_id}&format=json")
        assert res.status_code == 200
        assert len(res.json()) >= 1

    async def test_export_invalid_format(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=xml")
        assert res.status_code == 400


@allure.epic("TCMS API")
@allure.feature("Dify AI 同步")
class TestDifySyncStatus:
    async def test_sync_status_unconfigured(self, client: AsyncClient):
        res = await client.get("/api/v1/cases/sync/dify/status")
        assert res.status_code == 200
        data = res.json()
        assert data["configured"] is False
        assert data["synced_cases"] == 0

    async def test_sync_trigger_without_config(self, client: AsyncClient, project_id: int):
        res = await client.post(f"/api/v1/cases/sync/dify?project_id={project_id}")
        assert res.status_code == 503

    async def test_sync_trigger_missing_params(self, client: AsyncClient):
        res = await client.post("/api/v1/cases/sync/dify")
        assert res.status_code == 400
