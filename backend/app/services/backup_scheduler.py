"""
定期備份排程服務
使用 APScheduler，設定存在 data/backup_schedule.json，備份存在 backups/ 資料夾。
"""

import io
import json
import logging
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# ── 路徑設定 ──────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent.parent / "data"
BACKUP_DIR = Path(__file__).parent.parent.parent / "backups"
SCHEDULE_FILE = DATA_DIR / "backup_schedule.json"

DATA_DIR.mkdir(exist_ok=True)
BACKUP_DIR.mkdir(exist_ok=True)

# ── 預設設定 ───────────────────────────────────────────────────────────────────
DEFAULT_SCHEDULE = {
    "enabled": False,
    "schedule_type": "cron",       # "cron" | "interval"
    "cron_expression": "0 2 * * *", # 每天凌晨 2 點
    "interval_hours": 24,
    "project_id": 1,
    "keep_last_n": 10,              # 保留最近 N 份備份
    "last_run": None,
    "last_run_status": None,        # "success" | "error"
    "last_run_file": None,
    "next_run": None,
    "run_history": [],              # 最近 20 筆執行記錄
}

scheduler = AsyncIOScheduler()
_schedule_config: dict = {}


def load_schedule() -> dict:
    global _schedule_config
    if SCHEDULE_FILE.exists():
        try:
            with open(SCHEDULE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            _schedule_config = {**DEFAULT_SCHEDULE, **data}
        except Exception:
            _schedule_config = dict(DEFAULT_SCHEDULE)
    else:
        _schedule_config = dict(DEFAULT_SCHEDULE)
    return _schedule_config


def save_schedule(config: dict):
    global _schedule_config
    _schedule_config = config
    with open(SCHEDULE_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_schedule() -> dict:
    if not _schedule_config:
        load_schedule()
    cfg = dict(_schedule_config)
    # 計算下次執行時間（APScheduler 可查詢）
    job = scheduler.get_job("scheduled_backup")
    if job and job.next_run_time:
        cfg["next_run"] = job.next_run_time.isoformat()
    else:
        cfg["next_run"] = None
    return cfg


# ── 備份執行函式 ───────────────────────────────────────────────────────────────

async def run_backup_job():
    """定期備份任務主體，由 APScheduler 呼叫"""
    from app.db.database import DATABASE_URL
    from app.api.backup import (
        _export_suites, _export_cases_full, _export_cases_ai,
        _export_runs, _export_plans, _export_dashboard,
    )

    cfg = load_schedule()
    project_id = cfg.get("project_id", 1)
    keep_last_n = cfg.get("keep_last_n", 10)
    started_at = datetime.now(timezone.utc).isoformat()
    filename = None

    try:
        # 建立獨立 DB session
        engine = create_async_engine(DATABASE_URL, echo=False)
        AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with AsyncSessionLocal() as db:
            suites_data     = await _export_suites(project_id, db)
            suite_ids       = {s["id"] for s in suites_data}
            cases_full_data = await _export_cases_full(suite_ids, db)
            cases_ai_data   = await _export_cases_ai(suite_ids, db)
            runs_data       = await _export_runs(project_id, db)
            plans_data      = await _export_plans(project_id, db)
            dashboard_data  = await _export_dashboard(db)

        await engine.dispose()

        # 打包 ZIP
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"auto_backup_project{project_id}_{timestamp}.zip"
        filepath = BACKUP_DIR / filename

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("suites.json",    json.dumps(suites_data,     ensure_ascii=False, indent=2))
            zf.writestr("cases.json",     json.dumps(cases_full_data, ensure_ascii=False, indent=2))
            zf.writestr("cases_ai.json",  json.dumps(cases_ai_data,   ensure_ascii=False, indent=2))
            zf.writestr("runs.json",      json.dumps(runs_data,        ensure_ascii=False, indent=2))
            zf.writestr("plans.json",     json.dumps(plans_data,       ensure_ascii=False, indent=2))
            zf.writestr("dashboard.json", json.dumps(dashboard_data,  ensure_ascii=False, indent=2))
            zf.writestr("manifest.json",  json.dumps({
                "backup_time": datetime.now(timezone.utc).isoformat(),
                "project_id": project_id,
                "type": "scheduled",
                "counts": {
                    "suites": len(suites_data),
                    "cases": len(cases_full_data),
                    "runs": len(runs_data),
                    "plans": len(plans_data),
                },
            }, ensure_ascii=False, indent=2))
        buf.seek(0)
        filepath.write_bytes(buf.read())

        logger.info(f"[Scheduler] 備份成功：{filename}")

        # 清理舊備份
        _cleanup_old_backups(keep_last_n)

        # 更新設定
        cfg["last_run"] = started_at
        cfg["last_run_status"] = "success"
        cfg["last_run_file"] = filename
        _append_history(cfg, started_at, "success", filename)

    except Exception as e:
        logger.error(f"[Scheduler] 備份失敗：{e}")
        cfg["last_run"] = started_at
        cfg["last_run_status"] = "error"
        cfg["last_run_file"] = None
        _append_history(cfg, started_at, "error", str(e))

    save_schedule(cfg)


def _cleanup_old_backups(keep_last_n: int):
    """保留最近 N 份 auto_backup_*.zip，刪除舊的"""
    files = sorted(BACKUP_DIR.glob("auto_backup_*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    for old in files[keep_last_n:]:
        try:
            old.unlink()
            logger.info(f"[Scheduler] 刪除舊備份：{old.name}")
        except Exception:
            pass


def _append_history(cfg: dict, ts: str, status: str, detail: str):
    history = cfg.get("run_history", [])
    history.insert(0, {"time": ts, "status": status, "detail": detail})
    cfg["run_history"] = history[:20]  # 最多保留 20 筆


# ── 排程管理 ───────────────────────────────────────────────────────────────────

def _apply_schedule(cfg: dict):
    """根據設定重新掛載或移除 APScheduler job"""
    if scheduler.get_job("scheduled_backup"):
        scheduler.remove_job("scheduled_backup")

    if not cfg.get("enabled"):
        return

    schedule_type = cfg.get("schedule_type", "cron")
    if schedule_type == "interval":
        hours = max(1, int(cfg.get("interval_hours", 24)))
        trigger = IntervalTrigger(hours=hours)
    else:
        cron_expr = cfg.get("cron_expression", "0 2 * * *").strip().split()
        if len(cron_expr) != 5:
            cron_expr = ["0", "2", "*", "*", "*"]
        trigger = CronTrigger(
            minute=cron_expr[0], hour=cron_expr[1],
            day=cron_expr[2], month=cron_expr[3], day_of_week=cron_expr[4],
        )

    scheduler.add_job(
        run_backup_job,
        trigger=trigger,
        id="scheduled_backup",
        name="Scheduled Backup",
        replace_existing=True,
    )
    logger.info(f"[Scheduler] 排程已啟動：{schedule_type}")


def init_scheduler():
    """應用程式啟動時呼叫"""
    load_schedule()
    if not scheduler.running:
        scheduler.start()
    _apply_schedule(_schedule_config)
    logger.info("[Scheduler] APScheduler 啟動完成")


def shutdown_scheduler():
    """應用程式關閉時呼叫"""
    if scheduler.running:
        scheduler.shutdown(wait=False)


def update_schedule(new_config: dict) -> dict:
    """更新排程設定並重新套用"""
    cfg = load_schedule()
    # 只允許更新特定欄位
    allowed = {"enabled", "schedule_type", "cron_expression", "interval_hours", "project_id", "keep_last_n"}
    for k, v in new_config.items():
        if k in allowed:
            cfg[k] = v
    save_schedule(cfg)
    _apply_schedule(cfg)
    return get_schedule()


def list_backup_files() -> list:
    """回傳 backups/ 資料夾內的備份檔案清單"""
    files = sorted(BACKUP_DIR.glob("auto_backup_*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    return [
        {
            "filename": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files
    ]
