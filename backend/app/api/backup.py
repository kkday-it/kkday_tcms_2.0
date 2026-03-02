"""
一鍵備份 / 還原 API
GET  /backup?project_id=1          → 下載 ZIP
POST /backup/restore?project_id=1  → 上傳 ZIP 還原
"""

import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_plan import TestPlan, plan_cases, plan_runs
from app.models.test_result import TestResult
from app.models.test_run import TestRun
from app.models.test_step import TestStep
from app.models.test_suite import TestSuite

router = APIRouter()

# ── Export helpers ─────────────────────────────────────────────────────────────

async def _export_suites(project_id: int, db: AsyncSession) -> list:
    res = await db.execute(select(TestSuite).where(TestSuite.project_id == project_id).order_by(TestSuite.id))
    return [
        {
            "id": s.id,
            "name": s.name,
            "parent_suite_id": s.parent_suite_id,
            "project_id": s.project_id,
        }
        for s in res.scalars().all()
    ]


async def _export_cases_full(suite_ids: set, db: AsyncSession) -> list:
    """結構化格式（含 steps 陣列），供還原使用"""
    if not suite_ids:
        return []
    res = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .where(TestCase.suite_id.in_(suite_ids))
        .order_by(TestCase.id)
    )
    data = []
    for c in res.scalars().all():
        data.append({
            "id": c.id,
            "title": c.title,
            "suite_id": c.suite_id,
            "priority": c.priority,
            "layer": c.layer,
            "type": c.type,
            "automation_status": c.automation_status,
            "status": c.status,
            "description": c.description,
            "preconditions": c.preconditions,
            "steps": [
                {
                    "order": s.order,
                    "action": s.action,
                    "data": s.data,
                    "expected_result": s.expected_result,
                }
                for s in sorted(c.steps, key=lambda x: x.order)
            ],
        })
    return data


async def _export_cases_ai(suite_ids: set, db: AsyncSession) -> list:
    """AI JSON 格式（text + metadata），供向量資料庫使用"""
    if not suite_ids:
        return []
    res = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .where(TestCase.suite_id.in_(suite_ids))
        .order_by(TestCase.id)
    )
    data = []
    for c in res.scalars().all():
        steps_text = "\n".join(
            f"Step {s.order}: {s.action} | Expected: {s.expected_result}"
            for s in sorted(c.steps, key=lambda x: x.order)
        )
        text = f"Title: {c.title}\nPriority: {c.priority}\nLayer: {c.layer}\nType: {c.type}\n\nSteps:\n{steps_text}"
        data.append({
            "id": f"TC-{c.id}",
            "title": c.title,
            "text": text,
            "metadata": {
                "case_id": c.id,
                "suite_id": c.suite_id,
                "priority": c.priority,
                "layer": c.layer,
                "case_type": c.type,
                "automation_status": c.automation_status,
                "status": c.status,
            },
        })
    return data


async def _export_runs(project_id: int, db: AsyncSession) -> list:
    runs_res = await db.execute(
        select(TestRun)
        .options(selectinload(TestRun.assignees))
        .where(TestRun.project_id == project_id)
        .order_by(desc(TestRun.created_at))
    )
    runs = runs_res.scalars().all()
    run_ids = [r.id for r in runs]

    results_by_run: dict = {}
    if run_ids:
        res_query = (
            select(TestResult, TestCase.title.label("case_title"))
            .join(TestCase, TestResult.case_id == TestCase.id)
            .where(TestResult.run_id.in_(run_ids))
            .order_by(TestResult.run_id, TestResult.id)
        )
        for result, case_title in (await db.execute(res_query)).all():
            results_by_run.setdefault(result.run_id, []).append((result, case_title))

    data = []
    for run in runs:
        run_results = results_by_run.get(run.id, [])
        passed = sum(1 for r, _ in run_results if r.status == "Passed")
        failed = sum(1 for r, _ in run_results if r.status == "Failed")
        blocked = sum(1 for r, _ in run_results if r.status == "Blocked")
        total = len(run_results)
        data.append({
            "id": run.id,
            "title": run.title,
            "status": run.status,
            "run_type": run.run_type,
            "description": run.description,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "assignees": [a.username for a in (run.assignees or [])],
            "stats": {
                "total": total, "passed": passed, "failed": failed,
                "blocked": blocked, "untested": total - passed - failed - blocked,
            },
            "results": [
                {
                    "case_id": r.case_id,
                    "case_title": case_title,
                    "status": r.status,
                    "comment": r.comment,
                    "executed_at": r.executed_at.isoformat() if r.executed_at else None,
                    "jira_bug_id": r.jira_bug_id,
                }
                for r, case_title in run_results
            ],
        })
    return data


async def _export_plans(project_id: int, db: AsyncSession) -> list:
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.project_id == project_id)
        .order_by(TestPlan.id)
    )
    data = []
    for plan in result.scalars().all():
        data.append({
            "id": plan.id,
            "title": plan.title,
            "status": plan.status,
            "description": plan.description,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
            "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
            "linked_run_ids": [r.id for r in (plan.linked_runs or [])],
            "linked_case_ids": [c.id for c in (plan.linked_cases or [])],
        })
    return data


async def _export_dashboard(db: AsyncSession) -> dict:
    total_cases = (await db.execute(select(func.count(TestCase.id)))).scalar() or 0
    active_runs = (await db.execute(
        select(func.count(TestRun.id)).where(TestRun.status == "Active")
    )).scalar() or 0
    total_defects = (await db.execute(
        select(func.count(func.distinct(TestResult.jira_bug_id)))
        .where(TestResult.jira_bug_id.isnot(None))
    )).scalar() or 0
    runs_by_type = [
        {"name": row[0] or "Unspecified", "value": row[1]}
        for row in (await db.execute(
            select(TestRun.run_type, func.count(TestRun.id)).group_by(TestRun.run_type)
        )).all()
    ]
    top_failing = [
        {"title": row[0], "fail_count": row[1]}
        for row in (await db.execute(
            select(TestCase.title, func.count(TestResult.id).label("fail_count"))
            .join(TestResult, TestCase.id == TestResult.case_id)
            .where(TestResult.status == "Failed")
            .group_by(TestCase.id, TestCase.title)
            .order_by(desc("fail_count"))
            .limit(10)
        )).all()
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {"total_cases": total_cases, "active_runs": active_runs, "total_defects": total_defects},
        "run_types_distribution": runs_by_type,
        "top_failing_cases": top_failing,
    }


# ── Backup endpoint ───────────────────────────────────────────────────────────

@router.get("")
async def create_backup(
    project_id: int = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db),
):
    """一鍵備份：打包 suites / cases / runs / plans / dashboard 成 ZIP 下載。"""
    suites_data = await _export_suites(project_id, db)
    suite_ids = {s["id"] for s in suites_data}
    cases_full_data = await _export_cases_full(suite_ids, db)
    cases_ai_data = await _export_cases_ai(suite_ids, db)
    runs_data = await _export_runs(project_id, db)
    plans_data = await _export_plans(project_id, db)
    dashboard_data = await _export_dashboard(db)

    buf = io.BytesIO()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("suites.json",     json.dumps(suites_data,     ensure_ascii=False, indent=2))
        zf.writestr("cases.json",      json.dumps(cases_full_data, ensure_ascii=False, indent=2))
        zf.writestr("cases_ai.json",   json.dumps(cases_ai_data,   ensure_ascii=False, indent=2))
        zf.writestr("runs.json",       json.dumps(runs_data,        ensure_ascii=False, indent=2))
        zf.writestr("plans.json",      json.dumps(plans_data,       ensure_ascii=False, indent=2))
        zf.writestr("dashboard.json",  json.dumps(dashboard_data,  ensure_ascii=False, indent=2))
        zf.writestr("manifest.json",   json.dumps({
            "backup_time": datetime.now(timezone.utc).isoformat(),
            "project_id": project_id,
            "counts": {
                "suites": len(suites_data),
                "cases": len(cases_full_data),
                "runs": len(runs_data),
                "plans": len(plans_data),
            },
        }, ensure_ascii=False, indent=2))
    buf.seek(0)

    filename = f"tcms_backup_project{project_id}_{timestamp}.zip"
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Restore endpoint ──────────────────────────────────────────────────────────

@router.get("/schedule")
async def get_backup_schedule():
    """取得目前的定期備份設定與執行紀錄"""
    from app.services.backup_scheduler import get_schedule, list_backup_files
    cfg = get_schedule()
    cfg["backup_files"] = list_backup_files()
    return cfg


@router.put("/schedule")
async def update_backup_schedule(body: dict):
    """
    更新定期備份設定。

    ```json
    {
      "enabled": true,
      "schedule_type": "cron",       // "cron" | "interval"
      "cron_expression": "0 2 * * *", // Cron 格式（5 欄位）
      "interval_hours": 24,           // schedule_type=interval 時使用
      "project_id": 1,
      "keep_last_n": 10
    }
    ```
    """
    from app.services.backup_scheduler import update_schedule
    return update_schedule(body)


@router.post("/schedule/run-now")
async def run_backup_now():
    """立即執行一次排程備份（不影響排程週期）"""
    from app.services.backup_scheduler import run_backup_job, get_schedule
    import asyncio
    asyncio.create_task(run_backup_job())
    return {"status": "triggered", "message": "備份任務已觸發，請稍後查看執行紀錄"}


@router.get("/schedule/files/{filename}")
async def download_scheduled_backup(filename: str):
    """下載指定的排程備份檔案"""
    from app.services.backup_scheduler import BACKUP_DIR
    from fastapi.responses import FileResponse
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filename.startswith("auto_backup_"):
        raise HTTPException(status_code=404, detail="備份檔案不存在")
    return FileResponse(
        path=str(filepath),
        media_type="application/zip",
        filename=filename,
    )


@router.post("/restore")
async def restore_backup(
    project_id: Optional[int] = Query(None, description="目標 Project ID（不填則使用備份原本的 project_id）"),
    file: UploadFile = File(..., description="tcms_backup_*.zip"),
    db: AsyncSession = Depends(get_db),
):
    """
    一鍵還原：上傳備份 ZIP，依序還原 suites → cases → runs（含 results）→ plans（含關聯）。

    - 相同名稱的 suite / case / run / plan 會自動跳過（idempotent）。
    - 還原完成後回傳各類別的匯入數量摘要。
    """
    # ── 讀取 ZIP ──────────────────────────────────────────────────
    content = await file.read()
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise HTTPException(status_code=400, detail="上傳的檔案不是合法的 ZIP")

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        names = zf.namelist()
        for required in ("manifest.json", "suites.json", "cases.json", "runs.json", "plans.json"):
            if required not in names:
                raise HTTPException(status_code=400, detail=f"備份 ZIP 缺少必要檔案：{required}")

        manifest  = json.loads(zf.read("manifest.json"))
        suites_bk = json.loads(zf.read("suites.json"))
        cases_bk  = json.loads(zf.read("cases.json"))
        runs_bk   = json.loads(zf.read("runs.json"))
        plans_bk  = json.loads(zf.read("plans.json"))

    target_project_id = project_id or manifest.get("project_id")
    if not target_project_id:
        raise HTTPException(status_code=400, detail="無法判斷目標 project_id")

    summary = {"suites": 0, "cases": 0, "runs": 0, "results": 0, "plans": 0, "skipped": []}

    # ── 1. 還原 Suites ────────────────────────────────────────────
    # old_suite_id → new_suite_id
    suite_id_map: dict[int, int] = {}

    # 先取得目標 project 既有 suites（by name）
    existing_suites_res = await db.execute(
        select(TestSuite).where(TestSuite.project_id == target_project_id)
    )
    existing_suites_by_name: dict[str, TestSuite] = {
        s.name: s for s in existing_suites_res.scalars().all()
    }

    # 按層次（parent first）排序
    def _suite_order(suites: list) -> list:
        ordered, remaining = [], list(suites)
        ids_done: set = set()
        max_iter = len(suites) + 1
        while remaining and max_iter > 0:
            max_iter -= 1
            for s in list(remaining):
                if s["parent_suite_id"] is None or s["parent_suite_id"] in ids_done:
                    ordered.append(s)
                    ids_done.add(s["id"])
                    remaining.remove(s)
        ordered.extend(remaining)
        return ordered

    for s in _suite_order(suites_bk):
        name = s["name"]
        if name in existing_suites_by_name:
            suite_id_map[s["id"]] = existing_suites_by_name[name].id
            summary["skipped"].append(f"suite:{name}")
            continue

        parent_new_id = suite_id_map.get(s["parent_suite_id"]) if s["parent_suite_id"] else None
        new_suite = TestSuite(
            name=name,
            project_id=target_project_id,
            parent_suite_id=parent_new_id,
        )
        db.add(new_suite)
        await db.flush()
        suite_id_map[s["id"]] = new_suite.id
        existing_suites_by_name[name] = new_suite
        summary["suites"] += 1

    # ── 2. 還原 Cases ─────────────────────────────────────────────
    # old_case_id → new_case_id
    case_id_map: dict[int, int] = {}

    # 取得目標 suites 下既有 cases（by title+suite_new_id）
    new_suite_ids = set(suite_id_map.values())
    existing_cases_res = await db.execute(
        select(TestCase).where(TestCase.suite_id.in_(new_suite_ids))
    )
    existing_cases_key: set[tuple] = {
        (c.title, c.suite_id) for c in existing_cases_res.scalars().all()
    }
    # 也建立 case_id 反查（title+suite → new_id）
    existing_cases_by_key: dict[tuple, int] = {}
    for c in (await db.execute(select(TestCase).where(TestCase.suite_id.in_(new_suite_ids)))).scalars().all():
        existing_cases_by_key[(c.title, c.suite_id)] = c.id

    for c in cases_bk:
        new_suite_id = suite_id_map.get(c["suite_id"])
        if not new_suite_id:
            summary["skipped"].append(f"case:{c['title']} (suite not mapped)")
            continue

        key = (c["title"], new_suite_id)
        if key in existing_cases_key:
            case_id_map[c["id"]] = existing_cases_by_key[key]
            summary["skipped"].append(f"case:{c['title']}")
            continue

        new_case = TestCase(
            title=c["title"],
            suite_id=new_suite_id,
            priority=c.get("priority"),
            layer=c.get("layer"),
            type=c.get("type"),
            automation_status=c.get("automation_status"),
            status=c.get("status", "Active"),
            description=c.get("description"),
            preconditions=c.get("preconditions"),
        )
        db.add(new_case)
        await db.flush()
        case_id_map[c["id"]] = new_case.id

        for step in c.get("steps", []):
            db.add(TestStep(
                test_case_id=new_case.id,
                order=step["order"],
                action=step.get("action", ""),
                data=step.get("data", ""),
                expected_result=step.get("expected_result", ""),
            ))

        existing_cases_key.add(key)
        existing_cases_by_key[key] = new_case.id
        summary["cases"] += 1

    # ── 3. 還原 Runs（含 results）────────────────────────────────
    # old_run_id → new_run_id
    run_id_map: dict[int, int] = {}

    existing_runs_res = await db.execute(
        select(TestRun).where(TestRun.project_id == target_project_id)
    )
    existing_runs_by_title: dict[str, int] = {
        r.title: r.id for r in existing_runs_res.scalars().all()
    }

    for r in runs_bk:
        if r["title"] in existing_runs_by_title:
            run_id_map[r["id"]] = existing_runs_by_title[r["title"]]
            summary["skipped"].append(f"run:{r['title']}")
            continue

        new_run = TestRun(
            title=r["title"],
            project_id=target_project_id,
            status=r.get("status", "Active"),
            run_type=r.get("run_type"),
            description=r.get("description"),
        )
        db.add(new_run)
        await db.flush()
        run_id_map[r["id"]] = new_run.id
        existing_runs_by_title[r["title"]] = new_run.id
        summary["runs"] += 1

        for res in r.get("results", []):
            new_case_id = case_id_map.get(res["case_id"])
            if not new_case_id:
                continue
            db.add(TestResult(
                run_id=new_run.id,
                case_id=new_case_id,
                status=res.get("status", "Untested"),
                comment=res.get("comment"),
                jira_bug_id=res.get("jira_bug_id"),
            ))
            summary["results"] += 1

    # ── 4. 還原 Plans ─────────────────────────────────────────────
    existing_plans_res = await db.execute(
        select(TestPlan).where(TestPlan.project_id == target_project_id)
    )
    existing_plans_by_title: set[str] = {
        p.title for p in existing_plans_res.scalars().all()
    }

    for p in plans_bk:
        if p["title"] in existing_plans_by_title:
            summary["skipped"].append(f"plan:{p['title']}")
            continue

        new_plan = TestPlan(
            title=p["title"],
            project_id=target_project_id,
            status=p.get("status", "Draft"),
            description=p.get("description"),
        )
        db.add(new_plan)
        await db.flush()
        existing_plans_by_title.add(p["title"])
        summary["plans"] += 1

        # 關聯 runs
        new_run_ids = [run_id_map[rid] for rid in p.get("linked_run_ids", []) if rid in run_id_map]
        if new_run_ids:
            from sqlalchemy import insert
            await db.execute(
                insert(plan_runs).values([{"plan_id": new_plan.id, "run_id": rid} for rid in new_run_ids])
            )

        # 關聯 cases
        new_case_ids = [case_id_map[cid] for cid in p.get("linked_case_ids", []) if cid in case_id_map]
        if new_case_ids:
            from sqlalchemy import insert
            await db.execute(
                insert(plan_cases).values([{"plan_id": new_plan.id, "case_id": cid} for cid in new_case_ids])
            )

    await db.commit()

    return {
        "status": "success",
        "target_project_id": target_project_id,
        "imported": {
            "suites": summary["suites"],
            "cases": summary["cases"],
            "runs": summary["runs"],
            "results": summary["results"],
            "plans": summary["plans"],
        },
        "skipped_count": len(summary["skipped"]),
    }
