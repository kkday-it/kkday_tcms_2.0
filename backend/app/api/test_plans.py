import csv
import io
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_plan import TestPlan, plan_cases, plan_runs
from app.models.test_plan_history import TestPlanHistory
from app.models.test_run import TestRun
from app.schemas.test_plan import TestPlanCreate, TestPlanResponse, TestPlanUpdate
from app.schemas.test_plan_history import TestPlanHistoryResponse

router = APIRouter()


async def _load_plan(db: AsyncSession, plan_id: int) -> TestPlan:
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")
    return plan


def _plan_to_response(plan: TestPlan) -> dict:
    return {
        "id": plan.id,
        "project_id": plan.project_id,
        "title": plan.title,
        "description": plan.description,
        "status": plan.status,
        "folder_id": plan.folder_id,
        "run_ids": [r.id for r in (plan.linked_runs or [])],
        "case_ids": [c.id for c in (plan.linked_cases or [])],
        "prd_url": getattr(plan, "prd_url", None),
        "sa_docs": getattr(plan, "sa_docs", None) or [],
        "sd_docs": getattr(plan, "sd_docs", None) or [],
        "ued_docs": getattr(plan, "ued_docs", None) or [],
        "qa_docs": getattr(plan, "qa_docs", None) or [],
        "mindmap_url": getattr(plan, "mindmap_url", None),
        "timeline": getattr(plan, "timeline", None),
        "jira_unfix_filter_id": getattr(plan, "jira_unfix_filter_id", None),
        "jira_total_filter_id": getattr(plan, "jira_total_filter_id", None),
        "jira_display_fields": getattr(plan, "jira_display_fields", None)
        or ["key", "summary", "status", "assignee", "priority"],
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


async def _set_runs(db: AsyncSession, plan_id: int, run_ids: List[int]):
    await db.execute(delete(plan_runs).where(plan_runs.c.plan_id == plan_id))
    if run_ids:
        await db.execute(insert(plan_runs).values([{"plan_id": plan_id, "run_id": rid} for rid in run_ids]))


async def _set_cases(db: AsyncSession, plan_id: int, case_ids: List[int]):
    await db.execute(delete(plan_cases).where(plan_cases.c.plan_id == plan_id))
    if case_ids:
        await db.execute(insert(plan_cases).values([{"plan_id": plan_id, "case_id": cid} for cid in case_ids]))


@router.get("/export")
async def export_plans(
    project_id: int = Query(..., description="Project ID"),
    format: str = Query("csv", description="匯出格式：csv | json"),
    db: AsyncSession = Depends(get_db),
):
    """
    匯出 Test Plans。

    - **csv** — 每個 Plan 一行（含關聯 runs / cases 數量與 ID 列表）
    - **json** — 巢狀結構（plan → linked_runs, linked_cases 詳細資訊）
    """
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.project_id == project_id)
        .where(TestPlan.status != "Archived")
        .order_by(TestPlan.id)
    )
    plans = result.scalars().all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "plan_id", "title", "status", "description",
            "linked_runs_count", "linked_run_ids",
            "linked_cases_count", "linked_case_ids",
            "created_at", "updated_at",
        ])
        writer.writeheader()
        for plan in plans:
            writer.writerow({
                "plan_id": f"PLAN-{plan.id}",
                "title": plan.title,
                "status": plan.status,
                "description": plan.description or "",
                "linked_runs_count": len(plan.linked_runs or []),
                "linked_run_ids": ",".join(f"RUN-{r.id}" for r in (plan.linked_runs or [])),
                "linked_cases_count": len(plan.linked_cases or []),
                "linked_case_ids": ",".join(f"TC-{c.id}" for c in (plan.linked_cases or [])),
                "created_at": plan.created_at,
                "updated_at": plan.updated_at or "",
            })
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": "attachment; filename=test_plans.csv"},
        )

    elif format == "json":
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
                    {"id": f"TC-{c.id}", "title": c.title, "priority": c.priority, "automation_status": c.automation_status}
                    for c in (plan.linked_cases or [])
                ],
            })
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_plans.json"},
        )

    else:
        raise HTTPException(status_code=400, detail=f"不支援的格式：{format}。請使用 csv | json")


@router.get("/project/{project_id}", response_model=List[TestPlanResponse])
async def get_test_plans_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.project_id == project_id)
        .where(TestPlan.status != "Archived")
    )
    return [_plan_to_response(p) for p in result.scalars().all()]


@router.get("/", response_model=List[TestPlanResponse])
async def get_test_plans(project_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(TestPlan).options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
    if project_id:
        query = query.where(TestPlan.project_id == project_id)
    query = query.where(TestPlan.status != "Archived")
    result = await db.execute(query)
    return [_plan_to_response(p) for p in result.scalars().all()]


@router.post("/", response_model=TestPlanResponse)
async def create_test_plan(plan_in: TestPlanCreate, db: AsyncSession = Depends(get_db)):
    data = plan_in.model_dump(exclude={"run_ids", "case_ids"})
    db_plan = TestPlan(**data)
    db.add(db_plan)
    await db.flush()

    await _set_runs(db, db_plan.id, plan_in.run_ids or [])
    await _set_cases(db, db_plan.id, plan_in.case_ids or [])
    
    # Create history
    history = TestPlanHistory(
        plan_id=db_plan.id,
        user_id=1,
        action="Created",
        changed_fields=json.dumps({"title": db_plan.title})
    )
    db.add(history)

    await db.commit()
    return _plan_to_response(await _load_plan(db, db_plan.id))


@router.get("/{plan_id}", response_model=TestPlanResponse)
async def get_test_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    return _plan_to_response(await _load_plan(db, plan_id))


@router.put("/{plan_id}", response_model=TestPlanResponse)
async def update_test_plan(plan_id: int, plan_update: TestPlanUpdate, db: AsyncSession = Depends(get_db)):
    db_plan = await db.get(TestPlan, plan_id)
    if not db_plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")

    update_data = plan_update.model_dump(exclude={"run_ids", "case_ids"}, exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_plan, key, value)

    if plan_update.run_ids is not None:
        await _set_runs(db, plan_id, plan_update.run_ids)
    if plan_update.case_ids is not None:
        await _set_cases(db, plan_id, plan_update.case_ids)

    # History record (Simplified for now)
    history = TestPlanHistory(
        plan_id=db_plan.id,
        user_id=1,
        action="Updated",
        changed_fields=json.dumps({"update": "Plan fields or linked items modified"}, ensure_ascii=False)
    )
    db.add(history)

    await db.commit()
    return _plan_to_response(await _load_plan(db, plan_id))


@router.delete("/{plan_id}")
async def delete_test_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    db_plan = await db.get(TestPlan, plan_id)
    if not db_plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")
    db_plan.status = "Archived"
    
    # History record
    history = TestPlanHistory(
        plan_id=db_plan.id,
        user_id=1,
        action="Archived",
        changed_fields=json.dumps({"status": "Active -> Archived"}, ensure_ascii=False)
    )
    db.add(history)
    
    await db.commit()
    return {"message": "Test Plan archived"}

@router.post("/{plan_id}/restore")
async def restore_test_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    db_plan = await db.get(TestPlan, plan_id)
    if not db_plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")
    
    if db_plan.status != "Archived":
        return {"message": "Test Plan is not archived"}

    db_plan.status = "Draft"
    
    # History record
    history = TestPlanHistory(
        plan_id=db_plan.id,
        user_id=1,
        action="Restored",
        changed_fields=json.dumps({"status": "Archived -> Draft"}, ensure_ascii=False)
    )
    db.add(history)
    
    await db.commit()
    return {"message": "Test Plan restored successfully"}


@router.get("/{plan_id}/jira-issues")
async def get_plan_jira_issues(
    plan_id: int,
    filter_type: str = Query("unfix", description="unfix | total"),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch Jira issues by plan's configured filter ID.
    Uses production_atlassian secret. Requires SECRET_SERVICE_URL + AUTOMATION_TOKEN.
    """
    db_plan = await db.get(TestPlan, plan_id)
    if not db_plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")
    filter_id = (
        getattr(db_plan, "jira_unfix_filter_id", None)
        if filter_type == "unfix"
        else getattr(db_plan, "jira_total_filter_id", None)
    )
    if not filter_id:
        return {"issues": [], "filter_id": None, "message": f"No {filter_type} filter configured"}
    try:
        from app.services.jira_issues import fetch_issues_by_filter_id

        fields = getattr(db_plan, "jira_display_fields", None) or [
            "key",
            "summary",
            "status",
            "assignee",
            "priority",
        ]
        issues = fetch_issues_by_filter_id(filter_id=filter_id, fields=fields)
        from app.core.config import settings
        return {
            "issues": issues,
            "filter_id": filter_id,
            "view_url": f"{settings.JIRA_HOST}/issues/?filter={filter_id}",
        }
    except Exception as e:
        import httpx
        if isinstance(e, httpx.HTTPStatusError):
            err_text = e.response.text
            raise HTTPException(status_code=502, detail=f"Jira API error ({e.response.status_code}): {err_text}")
        elif isinstance(e, httpx.RequestError):
            raise HTTPException(status_code=502, detail=f"Jira API Request error: {str(e)}")
        else:
            raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)}")


@router.get("/jira/filter/{filter_id}/issues")
async def get_jira_issues_by_filter(
    filter_id: int,
    fields: str = Query(
        "status,priority,assignee,team",
        description="Comma-separated field names: status,priority,assignee,team,labels,created",
    ),
):
    """
    Fetch Jira issues for ANY filter ID directly (not tied to a plan).
    Supported fields: status, priority, assignee, team, labels, created, summary, key.
    """
    field_list = [f.strip() for f in fields.split(",") if f.strip()]
    # Always include key/summary for identification
    for required in ("key", "summary"):
        if required not in field_list:
            field_list.insert(0, required)
    try:
        from app.services.jira_issues import fetch_issues_by_filter_id
        from app.core.config import settings
        issues = fetch_issues_by_filter_id(filter_id=filter_id, fields=field_list, max_results=500)
        return {
            "issues": issues,
            "filter_id": filter_id,
            "view_url": f"{settings.JIRA_HOST}/issues/?filter={filter_id}",
        }
    except Exception as e:
        import httpx
        if isinstance(e, httpx.HTTPStatusError):
            raise HTTPException(status_code=502, detail=f"Jira API error ({e.response.status_code}): {e.response.text}")
        elif isinstance(e, httpx.RequestError):
            raise HTTPException(status_code=502, detail=f"Jira request error: {str(e)}")
        else:
            raise HTTPException(status_code=502, detail=f"Jira error: {str(e)}")


@router.get("/{plan_id}/history", response_model=List[TestPlanHistoryResponse])
async def get_test_plan_history(plan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestPlanHistory)
        .options(selectinload(TestPlanHistory.user))
        .where(TestPlanHistory.plan_id == plan_id)
        .order_by(TestPlanHistory.created_at.desc())
    )
    return result.scalars().all()
