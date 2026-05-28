import csv
import io
import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api.deps import record_audit, require_role
from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_result import TestResult
from app.models.test_run import TestRun
from app.models.test_run_history import TestRunHistory
from app.models.test_suite import TestSuite
from app.models.user import User
from app.schemas.test_run import BulkCopyRunsRequest, TestRunCreate, TestRunResponse, TestRunUpdate
from app.schemas.test_run_history import TestRunHistoryResponse

router = APIRouter()

# Explicit whitelist of fields to carry over when bulk-copying a run.
# Excludes id, created_at, completed_at (reset on copy) and any future
# sensitive columns added to the model.
_COPY_FIELDS = (
    "project_id",
    "folder_id",
    "test_plan_id",
    "title",
    "run_type",
    "description",
    "assignee_id",  # legacy single-assignee kept for DB compat
)


async def _get_run_with_assignees(run_id: int, db: AsyncSession) -> TestRun:
    """Fetch a single TestRun with its assignees eagerly loaded."""
    result = await db.execute(
        select(TestRun)
        .options(selectinload(TestRun.assignees))
        .where(TestRun.id == run_id)
    )
    return result.scalar_one_or_none()


async def _sync_assignees(run: TestRun, assignee_ids: List[int] | None, db: AsyncSession):
    """Sync the many-to-many assignees relation."""
    if assignee_ids is None:
        return
    if len(assignee_ids) == 0:
        run.assignees = []
        return
    users_result = await db.execute(select(User).where(User.id.in_(assignee_ids)))
    run.assignees = list(users_result.scalars().all())


def _build_response(run: TestRun, passed: int = 0, failed: int = 0, blocked: int = 0, untested: int = 0, total: int = 0) -> dict:
    """Build a response dict from a TestRun ORM object."""
    d = {c.name: getattr(run, c.name) for c in run.__table__.columns}
    d['passed'] = passed
    d['failed'] = failed
    d['blocked'] = blocked
    d['untested'] = untested
    d['total'] = total
    d['assignees'] = run.assignees if run.assignees else []
    return d


@router.get("/export")
async def export_runs(
    project_id: int = Query(..., description="Project ID"),
    run_id: Optional[int] = Query(None, description="只匯出指定 Run"),
    format: str = Query("csv", description="匯出格式：csv | json"),
    db: AsyncSession = Depends(get_db),
):
    """
    匯出 Test Run 執行結果。

    - **csv** — 每筆 result 展平成一行（含 run 資訊 + case + 狀態）
    - **json** — 巢狀結構（run → results → case 資訊）
    """
    # 查詢 runs
    run_query = (
        select(TestRun)
        .options(selectinload(TestRun.assignees))
        .where(TestRun.project_id == project_id)
        .where(TestRun.status != "Archived")
        .order_by(desc(TestRun.created_at))
    )
    if run_id:
        run_query = run_query.where(TestRun.id == run_id)
    runs_result = await db.execute(run_query)
    runs = runs_result.scalars().all()

    # 一次撈所有 results（含 case 資訊）
    run_ids = [r.id for r in runs]
    if not run_ids:
        results_by_run: dict = {}
    else:
        res_query = (
            select(TestResult, TestCase.title.label("case_title"))
            .join(TestCase, TestResult.case_id == TestCase.id)
            .where(TestResult.run_id.in_(run_ids))
            .order_by(TestResult.run_id, TestResult.id)
        )
        res_rows = (await db.execute(res_query)).all()
        results_by_run = {}
        for result, case_title in res_rows:
            results_by_run.setdefault(result.run_id, []).append((result, case_title))

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "run_id", "run_title", "run_status", "run_type",
            "run_created_at", "run_completed_at",
            "case_id", "case_title",
            "result_status", "comment", "executed_at",
            "jira_bug_id", "attachment_url",
        ])
        writer.writeheader()
        for run in runs:
            run_results = results_by_run.get(run.id, [])
            if not run_results:
                writer.writerow({
                    "run_id": f"RUN-{run.id}", "run_title": run.title,
                    "run_status": run.status, "run_type": run.run_type,
                    "run_created_at": run.created_at, "run_completed_at": run.completed_at or "",
                    "case_id": "", "case_title": "", "result_status": "",
                    "comment": "", "executed_at": "", "jira_bug_id": "", "attachment_url": "",
                })
            for result, case_title in run_results:
                writer.writerow({
                    "run_id": f"RUN-{run.id}", "run_title": run.title,
                    "run_status": run.status, "run_type": run.run_type,
                    "run_created_at": run.created_at, "run_completed_at": run.completed_at or "",
                    "case_id": f"TC-{result.case_id}", "case_title": case_title,
                    "result_status": result.status, "comment": result.comment or "",
                    "executed_at": result.executed_at or "", "jira_bug_id": result.jira_bug_id or "",
                    "attachment_url": result.attachment_url or "",
                })
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": "attachment; filename=test_runs.csv"},
        )

    elif format == "json":
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
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_runs.json"},
        )

    else:
        raise HTTPException(status_code=400, detail=f"不支援的格式：{format}。請使用 csv | json")


@router.get("/project/{project_id}", response_model=List[TestRunResponse])
async def list_runs_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    query = (
        select(
            TestRun,
            func.sum(case((TestResult.status == 'Passed', 1), else_=0)).label("passed"),
            func.sum(case((TestResult.status == 'Failed', 1), else_=0)).label("failed"),
            func.sum(case((TestResult.status == 'Blocked', 1), else_=0)).label("blocked"),
            func.count(TestResult.id).label("total")
        )
        .options(selectinload(TestRun.assignees))
        .outerjoin(TestResult, TestRun.id == TestResult.run_id)
        .where(TestRun.project_id == project_id)
        .where(TestRun.status != "Archived")
        .group_by(TestRun.id)
        .order_by(desc(TestRun.created_at))
    )
    result = await db.execute(query)
    rows = result.all()

    response_list = []
    for run_obj, passed, failed, blocked, total in rows:
        passed = passed or 0
        failed = failed or 0
        blocked = blocked or 0
        total = total or 0
        untested = total - passed - failed - blocked
        response_list.append(_build_response(run_obj, passed=passed, failed=failed, blocked=blocked, untested=untested, total=total))

    return response_list


@router.post("/", response_model=TestRunResponse)
async def create_run(run_in: TestRunCreate, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    run_data = run_in.model_dump(exclude={"case_ids", "assignee_ids"})
    run = TestRun(**run_data)

    # Set assignees BEFORE flush: object is still transient, no lazy-load triggered
    if run_in.assignee_ids:
        users_result = await db.execute(select(User).where(User.id.in_(run_in.assignee_ids)))
        run.assignees = list(users_result.scalars().all())

    db.add(run)
    await db.flush()  # get run.id without full commit

    # Fetch matching cases
    cases_query = select(TestCase).join(TestSuite).where(TestSuite.project_id == run.project_id)
    if run_in.case_ids is not None and len(run_in.case_ids) > 0:
        cases_query = cases_query.where(TestCase.id.in_(run_in.case_ids))

    cases_result = await db.execute(cases_query)
    cases = cases_result.scalars().all()

    results_to_insert = [
        TestResult(run_id=run.id, case_id=c.id, status="Untested", assignee_id=c.default_owner_id)
        for c in cases
    ]
    if results_to_insert:
        db.add_all(results_to_insert)

    await db.commit()

    # Reload with assignees
    run = await _get_run_with_assignees(run.id, db)
    return _build_response(run, untested=len(cases), total=len(cases))


@router.get("/{run_id}", response_model=TestRunResponse)
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get_run_with_assignees(run_id, db)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")

    # Recalculate stats
    stats_query = select(
        func.sum(case((TestResult.status == 'Passed', 1), else_=0)).label("passed"),
        func.sum(case((TestResult.status == 'Failed', 1), else_=0)).label("failed"),
        func.sum(case((TestResult.status == 'Blocked', 1), else_=0)).label("blocked"),
        func.count(TestResult.id).label("total")
    ).where(TestResult.run_id == run_id)
    stats_res = await db.execute(stats_query)
    passed, failed, blocked, total = stats_res.one()
    passed = passed or 0
    failed = failed or 0
    blocked = blocked or 0
    total = total or 0
    untested = total - passed - failed - blocked

    return _build_response(run, passed=passed, failed=failed, blocked=blocked, untested=untested, total=total)


@router.put("/{run_id}", response_model=TestRunResponse)
async def update_run(run_id: int, run_in: TestRunUpdate, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    run = await _get_run_with_assignees(run_id, db)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")

    update_data = run_in.model_dump(exclude={"case_ids", "assignee_ids"}, exclude_unset=True)
    for key, value in update_data.items():
        setattr(run, key, value)

    if run.status == "Done" and run.completed_at is None:
        run.completed_at = datetime.now(timezone.utc)
    elif run.status != "Done":
        run.completed_at = None

    # Sync assignees
    if run_in.assignee_ids is not None:
        await _sync_assignees(run, run_in.assignee_ids, db)

    if run_in.case_ids is not None:
        existing_results_result = await db.execute(select(TestResult).where(TestResult.run_id == run.id))
        existing_results = existing_results_result.scalars().all()
        existing_case_ids = {r.case_id for r in existing_results}

        new_case_ids = set(run_in.case_ids)
        cases_to_remove = existing_case_ids - new_case_ids
        cases_to_add = new_case_ids - existing_case_ids

        if cases_to_remove:
            for r in existing_results:
                if r.case_id in cases_to_remove:
                    await db.delete(r)

        if cases_to_add:
            cases_to_add_result = await db.execute(select(TestCase).where(TestCase.id.in_(cases_to_add)))
            new_results = [
                TestResult(run_id=run.id, case_id=c.id, status="Untested", assignee_id=c.default_owner_id)
                for c in cases_to_add_result.scalars().all()
            ]
            db.add_all(new_results)

    # History record
    history = TestRunHistory(
        run_id=run.id,
        user_id=1,
        action="Updated",
        changed_fields=json.dumps({"update": "Run fields or results modified"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()

    run = await _get_run_with_assignees(run_id, db)
    counts_result = await db.execute(
        select(
            func.sum(case((TestResult.status == 'Passed', 1), else_=0)),
            func.sum(case((TestResult.status == 'Failed', 1), else_=0)),
            func.sum(case((TestResult.status == 'Blocked', 1), else_=0)),
            func.count(TestResult.id),
        ).where(TestResult.run_id == run_id)
    )
    passed, failed, blocked, total = counts_result.one()
    passed = passed or 0
    failed = failed or 0
    blocked = blocked or 0
    total = total or 0
    untested = total - passed - failed - blocked
    return _build_response(run, passed=passed, failed=failed, blocked=blocked, untested=untested, total=total)


@router.delete("/{run_id}")
async def delete_run(
    run_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")

    run.status = "Archived"

    # History record
    history = TestRunHistory(
        run_id=run.id,
        user_id=1,
        action="Archived",
        changed_fields=json.dumps({"status": "Active -> Archived"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="delete_run",
        resource_type="test_run",
        resource_id=run_id,
    )
    return {"message": "TestRun archived successfully"}


@router.post("/bulk-copy", response_model=List[TestRunResponse])
async def bulk_copy_runs(body: BulkCopyRunsRequest, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    """Copy multiple runs at once, replacing '$template' in titles with the given date string.

    Performs everything in a single DB transaction to avoid per-run round-trips.
    """
    # Fetch all source runs with assignees in one query
    runs_result = await db.execute(
        select(TestRun)
        .options(selectinload(TestRun.assignees))
        .where(TestRun.id.in_(body.run_ids))
    )
    source_runs = {r.id: r for r in runs_result.scalars().all()}

    if not source_runs:
        raise HTTPException(status_code=404, detail="None of the specified runs were found")

    # Detect partially missing IDs — fail fast with an explicit message
    missing_ids = sorted(set(body.run_ids) - source_runs.keys())
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"The following run IDs were not found: {missing_ids}",
        )

    # Validate all runs belong to the same project to prevent cross-project copies
    project_ids = {r.project_id for r in source_runs.values()}
    if len(project_ids) > 1:
        raise HTTPException(
            status_code=400,
            detail="All runs must belong to the same project",
        )

    # Fetch all results for all source runs in one query
    results_result = await db.execute(
        select(TestResult).where(TestResult.run_id.in_(body.run_ids))
    )
    all_results = results_result.scalars().all()
    results_by_run: dict[int, list[TestResult]] = {}
    for r in all_results:
        results_by_run.setdefault(r.run_id, []).append(r)

    # Collect all assignee IDs across all runs and fetch users in one query
    all_assignee_ids = {a.id for run in source_runs.values() for a in run.assignees}
    user_map: dict[int, User] = {}
    if all_assignee_ids:
        users_result = await db.execute(select(User).where(User.id.in_(all_assignee_ids)))
        user_map = {u.id: u for u in users_result.scalars().all()}

    # Build all new runs using an explicit field whitelist — no flush yet
    ordered_sources = [source_runs[rid] for rid in body.run_ids if rid in source_runs]
    new_runs_with_meta: list[tuple[TestRun, list[TestResult]]] = []
    for source in ordered_sources:
        run_data = {f: getattr(source, f) for f in _COPY_FIELDS}
        run_data["title"] = run_data["title"].replace("$template", body.date_string)
        run_data["status"] = "Active"

        new_run = TestRun(**run_data)
        assignees = [user_map[a.id] for a in source.assignees if a.id in user_map]
        if assignees:
            new_run.assignees = assignees

        db.add(new_run)
        new_runs_with_meta.append((new_run, results_by_run.get(source.id, [])))

    # Single flush to obtain all new run IDs at once
    await db.flush()

    # Add all results now that IDs are available
    for new_run, source_results in new_runs_with_meta:
        if source_results:
            db.add_all([
                TestResult(run_id=new_run.id, case_id=r.case_id, status="Untested")
                for r in source_results
            ])

    await db.commit()

    # Reload all new runs in a single query instead of N individual queries
    new_ids = [new_run.id for new_run, _ in new_runs_with_meta]
    reloaded_result = await db.execute(
        select(TestRun)
        .options(selectinload(TestRun.assignees))
        .where(TestRun.id.in_(new_ids))
    )
    reloaded_map = {r.id: r for r in reloaded_result.scalars().all()}

    responses = []
    for new_run, source_results in new_runs_with_meta:
        refreshed = reloaded_map[new_run.id]
        responses.append(_build_response(refreshed, untested=len(source_results), total=len(source_results)))
    return responses


@router.post("/{run_id}/restore")
async def restore_test_run(
    run_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_role("Admin", "QA")),
):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")

    if run.status != "Archived":
        return {"message": "TestRun is not archived"}

    run.status = "Pending"

    # History record
    history = TestRunHistory(
        run_id=run.id,
        user_id=1,
        action="Restored",
        changed_fields=json.dumps({"status": "Archived -> Pending"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()
    await record_audit(
        db, request, actor,
        action="restore_run",
        resource_type="test_run",
        resource_id=run_id,
    )
    return {"message": "TestRun restored successfully"}


@router.post("/{run_id}/duplicate", response_model=TestRunResponse)
async def duplicate_run(run_id: int, db: AsyncSession = Depends(get_db), _actor: User = Depends(require_role("Admin", "QA"))):
    original_run = await _get_run_with_assignees(run_id, db)
    if not original_run:
        raise HTTPException(status_code=404, detail="Original TestRun not found")

    run_data = {f: getattr(original_run, f) for f in _COPY_FIELDS}
    run_data["title"] = f"{run_data['title']} (Copy)"
    run_data["status"] = "Active"

    # Save assignee IDs before flush to avoid lazy-load in async context
    assignee_ids = [a.id for a in original_run.assignees]

    new_run = TestRun(**run_data)
    db.add(new_run)
    await db.flush()

    # Sync assignees only when there are IDs to assign (new_run starts with no assignees)
    if assignee_ids:
        await _sync_assignees(new_run, assignee_ids, db)

    results_query = select(TestResult).where(TestResult.run_id == original_run.id)
    original_results = (await db.execute(results_query)).scalars().all()

    results_to_insert = [
        TestResult(run_id=new_run.id, case_id=r.case_id, status="Untested")
        for r in original_results
    ]
    if results_to_insert:
        db.add_all(results_to_insert)

    await db.commit()

    new_run = await _get_run_with_assignees(new_run.id, db)
    return _build_response(new_run, untested=len(original_results), total=len(original_results))


@router.get("/{run_id}/history", response_model=List[TestRunHistoryResponse])
async def get_test_run_history(run_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestRunHistory)
        .options(selectinload(TestRunHistory.user))
        .where(TestRunHistory.run_id == run_id)
        .order_by(TestRunHistory.created_at.desc())
    )
    return result.scalars().all()
