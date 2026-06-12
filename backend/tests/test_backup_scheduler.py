"""
Scheduled backup — Unit Tests

Guards the gap where the daily scheduled backup (run_backup_job) packed only the
JSON exports and omitted uploaded files, so a restore could never recover a lost
mindmap/image. The scheduled backup must now carry uploads/ just like the manual
GET /backup endpoint.
"""

import json
import zipfile

import pytest

import app.api.backup as bk
import app.services.backup_scheduler as bs


@pytest.mark.asyncio
async def test_scheduled_backup_includes_uploads(tmp_path, monkeypatch):
    # Stub the DB exports so no real tables are needed.
    async def _empty(*args, **kwargs):
        return []

    for fn in (
        "_export_suites", "_export_cases_full", "_export_cases_ai",
        "_export_runs", "_export_plans", "_export_dashboard",
    ):
        monkeypatch.setattr(bk, fn, _empty)

    # Avoid touching the real schedule config / history / cleanup.
    monkeypatch.setattr(bs, "load_schedule", lambda: {"project_id": 1, "keep_last_n": 10})
    monkeypatch.setattr(bs, "save_schedule", lambda cfg: None)
    monkeypatch.setattr(bs, "_cleanup_old_backups", lambda n: None)
    monkeypatch.setattr(bs, "_append_history", lambda *a, **k: None)

    backups = tmp_path / "backups"
    backups.mkdir()
    monkeypatch.setattr(bs, "BACKUP_DIR", backups)

    # Working dir with an uploads/ file (run_backup_job reads "uploads" relative).
    work = tmp_path / "work"
    (work / "uploads").mkdir(parents=True)
    (work / "uploads" / "mm.xmind").write_bytes(b"PK\x03\x04 mindmap")
    monkeypatch.chdir(work)

    # Exports are stubbed, so an empty in-memory DB is enough.
    monkeypatch.setenv("USE_LOCAL_DB", "true")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

    await bs.run_backup_job()

    zips = list(backups.glob("*.zip"))
    assert len(zips) == 1, "scheduled backup produced no zip"

    z = zipfile.ZipFile(zips[0])
    assert "uploads/mm.xmind" in z.namelist()
    assert z.read("uploads/mm.xmind") == b"PK\x03\x04 mindmap"
    assert json.loads(z.read("manifest.json"))["counts"]["uploads"] == 1


@pytest.mark.asyncio
async def test_scheduled_backup_without_uploads_dir(tmp_path, monkeypatch):
    """No uploads/ dir → backup still succeeds with counts.uploads == 0."""
    async def _empty(*args, **kwargs):
        return []

    for fn in (
        "_export_suites", "_export_cases_full", "_export_cases_ai",
        "_export_runs", "_export_plans", "_export_dashboard",
    ):
        monkeypatch.setattr(bk, fn, _empty)

    monkeypatch.setattr(bs, "load_schedule", lambda: {"project_id": 1, "keep_last_n": 10})
    monkeypatch.setattr(bs, "save_schedule", lambda cfg: None)
    monkeypatch.setattr(bs, "_cleanup_old_backups", lambda n: None)
    monkeypatch.setattr(bs, "_append_history", lambda *a, **k: None)

    backups = tmp_path / "backups"
    backups.mkdir()
    monkeypatch.setattr(bs, "BACKUP_DIR", backups)

    # Working dir with NO uploads/ subdir.
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.chdir(work)

    monkeypatch.setenv("USE_LOCAL_DB", "true")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

    await bs.run_backup_job()

    zips = list(backups.glob("*.zip"))
    assert len(zips) == 1, "scheduled backup produced no zip"

    z = zipfile.ZipFile(zips[0])
    assert not [n for n in z.namelist() if n.startswith("uploads/")]
    assert json.loads(z.read("manifest.json"))["counts"]["uploads"] == 0
