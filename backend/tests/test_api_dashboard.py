"""
Dashboard API 測試
涵蓋 /stats、/summary、/me
"""

import allure
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _seed(client: AsyncClient, project_id: int, suite_id: int):
    """建立基本資料以讓 dashboard 有數值"""
    case = (await client.post("/api/v1/cases/", json={
        "title": "Dashboard Case",
        "suite_id": suite_id,
        "priority": "High",
        "automation_status": "Manual",
    })).json()

    run = (await client.post("/api/v1/runs/", json={
        "title": "Dashboard Run",
        "project_id": project_id,
        "status": "Active",
        "run_type": "Regression",
    })).json()

    return case, run


@allure.epic("TCMS API")
@allure.feature("儀表板")
@allure.story("Stats 端點")
class TestDashboardStats:
    async def test_stats_returns_200(self, client: AsyncClient):
        res = await client.get("/api/v1/dashboard/stats")
        assert res.status_code == 200

    async def test_stats_has_required_fields(self, client: AsyncClient):
        res = await client.get("/api/v1/dashboard/stats")
        data = res.json()
        for field in ("total_cases", "active_runs", "passed_tests", "failed_tests"):
            assert field in data, f"missing: {field}"

    async def test_stats_fields_are_numbers(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/stats")).json()
        for field in ("total_cases", "active_runs", "passed_tests", "failed_tests"):
            assert isinstance(data[field], int)

    async def test_stats_reflects_data(self, client: AsyncClient, project_id: int, suite_id: int):
        """建立 case 後 total_cases 應增加"""
        before = (await client.get("/api/v1/dashboard/stats")).json()["total_cases"]
        await client.post("/api/v1/cases/", json={
            "title": "Stats Case", "suite_id": suite_id, "priority": "Low", "automation_status": "Manual",
        })
        after = (await client.get("/api/v1/dashboard/stats")).json()["total_cases"]
        assert after == before + 1


@allure.epic("TCMS API")
@allure.feature("儀表板")
@allure.story("Summary 端點")
class TestDashboardSummary:
    async def test_summary_returns_200(self, client: AsyncClient):
        res = await client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200

    async def test_summary_has_required_sections(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/summary")).json()
        for section in ("summary_cards", "run_types_distribution", "run_type_pass_fail", "recent_runs", "top_failing_cases"):
            assert section in data, f"missing section: {section}"

    async def test_summary_cards_fields(self, client: AsyncClient):
        cards = (await client.get("/api/v1/dashboard/summary")).json()["summary_cards"]
        for field in ("total_cases", "active_runs", "total_defects"):
            assert field in cards

    async def test_summary_recent_runs_is_list(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/summary")).json()
        assert isinstance(data["recent_runs"], list)

    async def test_summary_recent_runs_has_stats(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed(client, project_id, suite_id)
        data = (await client.get("/api/v1/dashboard/summary")).json()
        recent = data["recent_runs"]
        if recent:
            run = recent[0]
            for field in ("id", "title", "status", "passed", "failed", "total"):
                assert field in run

    async def test_summary_run_types_distribution_is_list(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/summary")).json()
        assert isinstance(data["run_types_distribution"], list)

    async def test_summary_top_failing_cases_is_list(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/summary")).json()
        assert isinstance(data["top_failing_cases"], list)


@allure.epic("TCMS API")
@allure.feature("儀表板")
@allure.story("Me 個人儀表板")
class TestDashboardMe:
    async def test_me_returns_200(self, client: AsyncClient):
        res = await client.get("/api/v1/dashboard/me?user_id=1")
        assert res.status_code == 200

    async def test_me_has_required_fields(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/me?user_id=1")).json()
        assert "assigned_runs" in data
        assert "metrics" in data

    async def test_me_metrics_fields(self, client: AsyncClient):
        metrics = (await client.get("/api/v1/dashboard/me?user_id=1")).json()["metrics"]
        for field in ("cases_owned", "cases_automated", "recent_executions_7d"):
            assert field in metrics

    async def test_me_assigned_runs_is_list(self, client: AsyncClient):
        data = (await client.get("/api/v1/dashboard/me?user_id=1")).json()
        assert isinstance(data["assigned_runs"], list)

    async def test_me_missing_user_id_returns_422(self, client: AsyncClient):
        res = await client.get("/api/v1/dashboard/me")
        assert res.status_code == 422
