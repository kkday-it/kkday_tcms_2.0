"""
Backup / Restore API 測試
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


async def _make_backup_zip(client: AsyncClient, project_id: int, suite_id: int) -> bytes:
    """建立有資料的備份 ZIP，回傳 bytes"""
    await _seed_data(client, project_id, suite_id)
    res = await client.get(f"/api/v1/backup?project_id={project_id}")
    assert res.status_code == 200
    return res.content


# ── Backup Tests ──────────────────────────────────────────────────────────────

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
        assert zipfile.is_zipfile(io.BytesIO(res.content))

    async def test_backup_zip_contains_required_files(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            names = zf.namelist()
        for expected in ("suites.json", "cases.json", "cases_ai.json", "runs.json", "plans.json", "dashboard.json", "manifest.json"):
            assert expected in names, f"{expected} missing from ZIP"

    async def test_backup_suites_json_is_valid(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            suites = json.loads(zf.read("suites.json"))
        assert isinstance(suites, list)
        assert len(suites) >= 1
        assert "id" in suites[0] and "name" in suites[0]

    async def test_backup_cases_json_is_full_format(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            cases = json.loads(zf.read("cases.json"))
        assert isinstance(cases, list) and len(cases) >= 1
        c = cases[0]
        assert "id" in c
        assert "title" in c
        assert "steps" in c
        assert isinstance(c["steps"], list)

    async def test_backup_cases_ai_json_is_ai_format(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            cases_ai = json.loads(zf.read("cases_ai.json"))
        assert isinstance(cases_ai, list) and len(cases_ai) >= 1
        item = cases_ai[0]
        assert "text" in item and "metadata" in item

    async def test_backup_runs_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            runs = json.loads(zf.read("runs.json"))
        assert isinstance(runs, list) and len(runs) >= 1
        r = runs[0]
        assert "id" in r and "title" in r and "stats" in r and "results" in r

    async def test_backup_plans_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            plans = json.loads(zf.read("plans.json"))
        assert isinstance(plans, list) and len(plans) >= 1
        p = plans[0]
        assert "id" in p and "title" in p and "linked_run_ids" in p and "linked_case_ids" in p

    async def test_backup_dashboard_json_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            dashboard = json.loads(zf.read("dashboard.json"))
        assert "generated_at" in dashboard
        assert "summary" in dashboard
        assert "total_cases" in dashboard["summary"]

    async def test_backup_manifest_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        await _seed_data(client, project_id, suite_id)
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest["project_id"] == project_id
        assert "backup_time" in manifest
        counts = manifest["counts"]
        assert counts["suites"] >= 1
        assert counts["cases"] >= 1

    async def test_backup_empty_project_still_succeeds(self, client: AsyncClient, project_id: int):
        res = await client.get(f"/api/v1/backup?project_id={project_id}")
        assert res.status_code == 200
        with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
            assert json.loads(zf.read("cases.json")) == []
            assert json.loads(zf.read("runs.json")) == []
            assert json.loads(zf.read("plans.json")) == []

    async def test_backup_missing_project_id_returns_422(self, client: AsyncClient):
        res = await client.get("/api/v1/backup")
        assert res.status_code == 422


# ── Restore Tests ─────────────────────────────────────────────────────────────

class TestRestoreAPI:
    async def _upload_zip(self, client: AsyncClient, project_id: int, zip_bytes: bytes, target_project_id: int | None = None):
        pid = target_project_id or project_id
        return await client.post(
            f"/api/v1/backup/restore?project_id={pid}",
            files={"file": ("backup.zip", zip_bytes, "application/zip")},
        )

    async def test_restore_returns_200(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        # 建新 project 作為還原目標
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Target"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        assert res.status_code == 200

    async def test_restore_response_structure(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Struct"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        data = res.json()
        assert data["status"] == "success"
        assert "imported" in data
        assert "skipped_count" in data

    async def test_restore_imports_suites(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Suites"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        assert res.json()["imported"]["suites"] >= 1

    async def test_restore_imports_cases(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Cases"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        assert res.json()["imported"]["cases"] >= 1

    async def test_restore_imports_runs(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Runs"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        assert res.json()["imported"]["runs"] >= 1

    async def test_restore_imports_plans(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Plans"})).json()
        res = await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        assert res.json()["imported"]["plans"] >= 1

    async def test_restore_idempotent_skips_duplicates(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Idempotent"})).json()
        pid = new_proj["id"]
        # 第一次還原
        res1 = await self._upload_zip(client, project_id, zip_bytes, pid)
        imported1 = res1.json()["imported"]["cases"]
        # 第二次還原 — 全部應跳過
        res2 = await self._upload_zip(client, project_id, zip_bytes, pid)
        data2 = res2.json()
        assert data2["imported"]["cases"] == 0
        assert data2["skipped_count"] > 0

    async def test_restore_cases_are_queryable(self, client: AsyncClient, project_id: int, suite_id: int):
        zip_bytes = await _make_backup_zip(client, project_id, suite_id)
        new_proj = (await client.post("/api/v1/projects/", json={"name": "Restore Query"})).json()
        await self._upload_zip(client, project_id, zip_bytes, new_proj["id"])
        # 確認 case 確實存在於新 project
        suites_res = await client.get(f"/api/v1/suites/project/{new_proj['id']}")
        assert len(suites_res.json()) >= 1

    async def test_restore_invalid_zip_returns_400(self, client: AsyncClient, project_id: int):
        fake_zip = b"this is not a zip file"
        res = await client.post(
            f"/api/v1/backup/restore?project_id={project_id}",
            files={"file": ("bad.zip", fake_zip, "application/zip")},
        )
        assert res.status_code == 400

    async def test_restore_missing_file_returns_422(self, client: AsyncClient, project_id: int):
        res = await client.post(f"/api/v1/backup/restore?project_id={project_id}")
        assert res.status_code == 422
