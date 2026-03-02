"""
一鍵備份 API
GET /backup?project_id=1  →  下載 ZIP，內含 cases / runs / plans / dashboard
"""

import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, case as sa_case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_plan import TestPlan
from app.models.test_result import TestResult
from app.models.test_run import TestRun
from app.models.test_step import TestStep
from app.models.test_suite import TestSuite

router = APIRouter()


async def _export_cases(project_id: int, db: AsyncSession) -> list:
    """匯出所有 Test Cases（AI JSON 格式）"""
    suites_res = await db.execute(select(TestSuite).where(TestSuite.project_id == project_id))
    suite_ids = {s.id for s in suites_res.scalars().all()}

    if not suite_ids:
        return []

    cases_res = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .where(TestCase.suite_id.in_(suite_ids))
        .order_by(TestCase.id)
    )
    cases = cases_res.scalars().all()

    data = []
    for c in cases:
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
    """匯出所有 Test Runs（含 results）"""
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
            "id": f"RUN-{run.id}",
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
                    "case_id": f"TC-{r.case_id}",
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
    """匯出所有 Test Plans（含 linked runs/cases）"""
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.project_id == project_id)
        .order_by(TestPlan.id)
    )
    plans = result.scalars().all()

    data = []
    for plan in plans:
        data.append({
            "id": f"PLAN-{plan.id}",
            "title": plan.title,
            "status": plan.status,
            "description": plan.description,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
            "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
            "linked_runs": [
                {"id": f"RUN-{r.id}", "title": r.title, "status": r.status}
                for r in (plan.linked_runs or [])
            ],
            "linked_cases": [
                {"id": f"TC-{c.id}", "title": c.title, "priority": c.priority}
                for c in (plan.linked_cases or [])
            ],
        })
    return data


async def _export_dashboard(db: AsyncSession) -> dict:
    """匯出 Dashboard 統計摘要"""
    total_cases = (await db.execute(select(func.count(TestCase.id)))).scalar() or 0
    active_runs = (await db.execute(
        select(func.count(TestRun.id)).where(TestRun.status == "Active")
    )).scalar() or 0

    defects_query = select(
        func.count(func.distinct(TestResult.jira_bug_id))
    ).where(TestResult.jira_bug_id.isnot(None))
    total_defects = (await db.execute(defects_query)).scalar() or 0

    runs_by_type_res = await db.execute(
        select(TestRun.run_type, func.count(TestRun.id)).group_by(TestRun.run_type)
    )
    run_types_distribution = [
        {"name": row[0] or "Unspecified", "value": row[1]}
        for row in runs_by_type_res.all()
    ]

    top_failing_res = await db.execute(
        select(TestCase.title, func.count(TestResult.id).label("fail_count"))
        .join(TestResult, TestCase.id == TestResult.case_id)
        .where(TestResult.status == "Failed")
        .group_by(TestCase.id, TestCase.title)
        .order_by(desc("fail_count"))
        .limit(10)
    )
    top_failing_cases = [{"title": row[0], "fail_count": row[1]} for row in top_failing_res.all()]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_cases": total_cases,
            "active_runs": active_runs,
            "total_defects": total_defects,
        },
        "run_types_distribution": run_types_distribution,
        "top_failing_cases": top_failing_cases,
    }


@router.get("")
async def create_backup(
    project_id: int = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    一鍵備份：打包 cases / runs / plans / dashboard 成 ZIP 下載。
    """
    cases_data = await _export_cases(project_id, db)
    runs_data = await _export_runs(project_id, db)
    plans_data = await _export_plans(project_id, db)
    dashboard_data = await _export_dashboard(db)

    # 打包成 ZIP
    buf = io.BytesIO()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("cases.json", json.dumps(cases_data, ensure_ascii=False, indent=2))
        zf.writestr("runs.json", json.dumps(runs_data, ensure_ascii=False, indent=2))
        zf.writestr("plans.json", json.dumps(plans_data, ensure_ascii=False, indent=2))
        zf.writestr("dashboard.json", json.dumps(dashboard_data, ensure_ascii=False, indent=2))
        zf.writestr("manifest.json", json.dumps({
            "backup_time": datetime.now(timezone.utc).isoformat(),
            "project_id": project_id,
            "counts": {
                "cases": len(cases_data),
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
