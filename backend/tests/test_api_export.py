"""
Export API 測試
驗證 Test Cases / Test Runs / Test Plans 的匯出端點
"""

import csv
import io
import json

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── helpers ──────────────────────────────────────────────────────────────────

async def _create_case(client: AsyncClient, suite_id: int, title: str = "TC-Export") -> int:
    res = await client.post("/api/v1/cases/", json={
        "title": title,
        "suite_id": suite_id,
        "priority": "High",
        "automation_status": "Manual",
        "steps": [
            {"action": "Step 1", "data": "", "expected_result": "OK", "order": 1},
        ],
    })
    assert res.status_code == 200, res.text
    return res.json()["id"]


async def _create_run(client: AsyncClient, project_id: int, title: str = "Run-Export") -> int:
    res = await client.post("/api/v1/runs/", json={
        "title": title,
        "project_id": project_id,
        "status": "Active",
        "run_type": "Feature Test",
    })
    assert res.status_code == 200, res.text
    return res.json()["id"]


async def _create_plan(client: AsyncClient, project_id: int, title: str = "Plan-Export") -> int:
    res = await client.post("/api/v1/plans/", json={
        "title": title,
        "project_id": project_id,
        "status": "Draft",
    })
    assert res.status_code == 200, res.text
    return res.json()["id"]


# ── Test Cases Export ─────────────────────────────────────────────────────────

class TestCasesExport:
    async def test_export_csv_returns_200(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "CSV Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=csv")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]

    async def test_export_csv_has_header_row(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "CSV Header Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=csv")
        reader = csv.DictReader(io.StringIO(res.text))
        assert "case_id" in reader.fieldnames
        assert "title" in reader.fieldnames
        assert "priority" in reader.fieldnames

    async def test_export_csv_contains_case_data(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Unique CSV Title")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=csv")
        assert "Unique CSV Title" in res.text

    async def test_export_json_returns_200(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "JSON Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    async def test_export_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "JSON Struct Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=json")
        case = res.json()[0]
        assert "id" in case
        assert "title" in case
        assert "steps" in case
        assert isinstance(case["steps"], list)

    async def test_export_ai_json_returns_200(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "AI JSON Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=ai_json")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    async def test_export_ai_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "AI Struct Case")
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=ai_json")
        item = res.json()[0]
        assert "id" in item
        assert "text" in item
        assert "metadata" in item

    async def test_export_with_suite_filter(self, client: AsyncClient, project_id: int, suite_id: int):
        await _create_case(client, suite_id, "Filtered Case")
        # 建立另一個 suite，確認 suite filter 只回傳指定 suite 的 case
        other_res = await client.post("/api/v1/suites/", json={"name": "Other Suite", "project_id": project_id})
        other_suite_id = other_res.json()["id"]
        await _create_case(client, other_suite_id, "Other Suite Case")

        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&suite_id={suite_id}&format=json")
        assert res.status_code == 200
        titles = [c["title"] for c in res.json()]
        assert "Filtered Case" in titles
        assert "Other Suite Case" not in titles

    async def test_export_invalid_format_returns_400(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=xlsx")
        assert res.status_code == 400

    async def test_export_empty_project_returns_empty_list(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/cases/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        assert res.json() == []


# ── Test Runs Export ──────────────────────────────────────────────────────────

class TestRunsExport:
    async def test_export_runs_csv_returns_200(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id, "Run CSV")
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=csv")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]

    async def test_export_runs_csv_has_header(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id)
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=csv")
        reader = csv.DictReader(io.StringIO(res.text))
        assert "run_id" in reader.fieldnames
        assert "run_title" in reader.fieldnames
        assert "result_status" in reader.fieldnames

    async def test_export_runs_csv_contains_run_data(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id, "Unique Run Title")
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=csv")
        assert "Unique Run Title" in res.text

    async def test_export_runs_json_returns_200(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id)
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_export_runs_json_structure(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id, "JSON Run")
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=json")
        run = res.json()[0]
        assert "id" in run
        assert "title" in run
        assert "status" in run
        assert "stats" in run
        assert "results" in run

    async def test_export_runs_json_stats_keys(self, client: AsyncClient, project_id: int):
        await _create_run(client, project_id)
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=json")
        stats = res.json()[0]["stats"]
        for key in ("total", "passed", "failed", "blocked", "untested"):
            assert key in stats

    async def test_export_single_run_by_run_id(self, client: AsyncClient, project_id: int):
        run_id = await _create_run(client, project_id, "Single Run")
        await _create_run(client, project_id, "Another Run")
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&run_id={run_id}&format=json")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["id"] == f"RUN-{run_id}"

    async def test_export_runs_invalid_format_returns_400(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=xml")
        assert res.status_code == 400

    async def test_export_runs_empty_project(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/runs/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        assert res.json() == []


# ── Test Plans Export ─────────────────────────────────────────────────────────

class TestPlansExport:
    async def test_export_plans_csv_returns_200(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=csv")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]

    async def test_export_plans_csv_has_header(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=csv")
        reader = csv.DictReader(io.StringIO(res.text))
        assert "plan_id" in reader.fieldnames
        assert "title" in reader.fieldnames
        assert "linked_runs_count" in reader.fieldnames

    async def test_export_plans_csv_contains_plan_data(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id, "Unique Plan Title")
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=csv")
        assert "Unique Plan Title" in res.text

    async def test_export_plans_json_returns_200(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_export_plans_json_structure(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id, "JSON Plan")
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=json")
        plan = res.json()[0]
        assert "id" in plan
        assert "title" in plan
        assert "status" in plan
        assert "linked_runs" in plan
        assert "linked_cases" in plan

    async def test_export_plans_json_linked_fields(self, client: AsyncClient, project_id: int):
        await _create_plan(client, project_id)
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=json")
        plan = res.json()[0]
        assert isinstance(plan["linked_runs"], list)
        assert isinstance(plan["linked_cases"], list)

    async def test_export_plans_invalid_format_returns_400(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=pdf")
        assert res.status_code == 400

    async def test_export_plans_empty_project(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/plans/export?project_id={project_id}&format=json")
        assert res.status_code == 200
        assert res.json() == []
