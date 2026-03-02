"""
Backup API 測試
驗證一鍵備份端點回傳有效 ZIP 且包含預期的 JSON 檔案
"""

import io
import json
import zipfile

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _seed_data(client: AsyncClient, project_id: int, suite_id: int):
    """建立基本測試資料：1 case, 1 run, 1 plan"""
    await client.post("/api/v1/cases/", json={
        "title": "Backup TC",
        "suite_id": suite_id,
        "priority": "High",
        "automation_status": "Manual",
        "steps": [{"action": "Do something", "data": "", "expected_result": "Works", "order": 1}],
    })
    await client.post("/api/v1/runs/", json={
        "title": "Backup Run",
        "project_id": project_id,
        "status": "Active",
        "run_type": "Feature Test",
    })
    await client.post("/api/v1/plans/", json={
        "title": "Backup Plan",
        "project_id": project_id,
        "status": "Draft",
    })


class TestBackupAPI:
    async def test_backup_returns_200(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        assert res.status_code == 200

    async def test_backup_content_type_is_zip(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        assert "application/zip" in res.headers["content-type"]

    async def test_backup_content_disposition_has_filename(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        assert "attachment" in res.headers["content-disposition"]
        assert ".zip" in res.headers["content-disposition"]

    async def test_backup_zip_is_valid(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        buf = io.BytesIO(res.content)
        assert zipfile.is_zipfile(buf)

    async def test_backup_zip_contains_required_files(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        buf = io.BytesIO(res.content)
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
        for expected in ("cases.json", "runs.json", "plans.json", "dashboard.json", "manifest.json"):
            assert expected in names, f"{expected} missing from ZIP"

    async def test_backup_cases_json_is_valid_json(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            cases = json.loads(zf.read("cases.json"))
        assert isinstance(cases, list)
        assert len(cases) >= 1

    async def test_backup_cases_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            cases = json.loads(zf.read("cases.json"))
        c = cases[0]
        assert "id" in c
        assert "text" in c
        assert "metadata" in c

    async def test_backup_runs_json_is_valid_json(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            runs = json.loads(zf.read("runs.json"))
        assert isinstance(runs, list)
        assert len(runs) >= 1

    async def test_backup_runs_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            runs = json.loads(zf.read("runs.json"))
        r = runs[0]
        assert "id" in r
        assert "title" in r
        assert "stats" in r
        assert "results" in r

    async def test_backup_plans_json_is_valid_json(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            plans = json.loads(zf.read("plans.json"))
        assert isinstance(plans, list)
        assert len(plans) >= 1

    async def test_backup_plans_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            plans = json.loads(zf.read("plans.json"))
        p = plans[0]
        assert "id" in p
        assert "title" in p
        assert "linked_runs" in p
        assert "linked_cases" in p

    async def test_backup_dashboard_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            dashboard = json.loads(zf.read("dashboard.json"))
        assert "generated_at" in dashboard
        assert "summary" in dashboard
        summary = dashboard["summary"]
        assert "total_cases" in summary
        assert "active_runs" in summary

    async def test_backup_manifest_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest["project_id"] == project_id
        assert "backup_time" in manifest
        assert "counts" in manifest
        counts = manifest["counts"]
        assert counts["cases"] >= 1
        assert counts["runs"] >= 1
        assert counts["plans"] >= 1

    async def test_backup_empty_project_still_succeeds(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        assert res.status_code == 200
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            cases = json.loads(zf.read("cases.json"))
            runs = json.loads(zf.read("runs.json"))
            plans = json.loads(zf.read("plans.json"))
        assert cases == []
        assert runs == []
        assert plans == []

    async def test_backup_missing_project_id_returns_422(self, client: AsyncClient):
        res = await client.get("/api/v1/backup")
        assert res.status_code == 422
