import csv
import io
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_case_history import TestCaseHistory
from app.models.test_step import TestStep
from app.models.test_suite import TestSuite
from app.schemas.test_case import TestCaseCreate, TestCaseResponse, TestCaseUpdate, TestCaseBatchDelete, TestCaseBatchMove
from app.schemas.test_case_history import TestCaseHistoryResponse
from app.services.dify_sync import build_case_metadata, build_case_text

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/labels/all", response_model=List[str])
async def get_all_labels(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase.labels).where(TestCase.labels.is_not(None)))
    
    unique_labels = set()
    for row in result.all():
        labels_json = row[0]
        if labels_json:
            try:
                import json
                labels = json.loads(labels_json)
                if isinstance(labels, list):
                    unique_labels.update([str(l).strip() for l in labels])
            except Exception:
                # Fallback to comma separation
                labels = [l.strip() for l in labels_json.split(',')]
                unique_labels.update(labels)
                
    return sorted(list(unique_labels))

@router.get("/project/{project_id}", response_model=List[TestCaseResponse])
async def list_cases_by_project(
    project_id: int, 
    exclude_tags: Optional[str] = None,
    exclude_labels: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(TestCase)
        .join(TestSuite)
        .options(selectinload(TestCase.steps))
        .where(TestSuite.project_id == project_id)
    )

    if exclude_tags:
        exclude_tags_list = [t.strip().lower() for t in exclude_tags.split(',')]
        for tag in exclude_tags_list:
            query = query.where((TestCase.tags.is_(None)) | (~TestCase.tags.ilike(f"%{tag}%")))

    if exclude_labels:
        exclude_labels_list = [l.strip().lower() for l in exclude_labels.split(',')]
        for label in exclude_labels_list:
            query = query.where((TestCase.labels.is_(None)) | (~TestCase.labels.ilike(f"%{label}%")))

    result = await db.execute(query)
    return result.scalars().all()

@router.get("/suite/{suite_id}", response_model=List[TestCaseResponse])
async def list_cases_by_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    # Recursive CTE to find the suite and all its descendant suites
    hierarchy = (
        select(TestSuite.id)
        .where(TestSuite.id == suite_id)
        .cte(name="suite_hierarchy", recursive=True)
    )
    
    hierarchy = hierarchy.union_all(
        select(TestSuite.id)
        .where(TestSuite.parent_suite_id == hierarchy.c.id)
    )

    result = await db.execute(
        select(TestCase)
        .options(selectinload(TestCase.steps))
        .where(TestCase.suite_id.in_(select(hierarchy.c.id)))
    )
    return result.scalars().all()

@router.post("/", response_model=TestCaseResponse)
async def create_case(case_in: TestCaseCreate, db: AsyncSession = Depends(get_db)):
    case_data = case_in.model_dump(exclude={"steps"})
    case = TestCase(**case_data)
    
    db.add(case)
    await db.flush() # get case.id

    for step_in in case_in.steps:
        step = TestStep(**step_in.model_dump(), test_case_id=case.id)
        db.add(step)
    
    # Create History Record (Created)
    history = TestCaseHistory(
        case_id=case.id,
        user_id=1,  # Hardcoded User 1 for now until auth is fully integrated
        action="Created",
        changed_fields=json.dumps({"title": case.title})
    )
    db.add(history)

    await db.commit()
    await db.refresh(case)
    
    # Reload with steps
    result = await db.execute(select(TestCase).options(selectinload(TestCase.steps)).where(TestCase.id == case.id))
    return result.scalar_one()

@router.get("/export")
async def export_cases(
    project_id: int = Query(..., description="Project ID"),
    suite_id: Optional[int] = Query(None, description="限定 Suite（含子 Suite），不填則匯出整個 Project"),
    format: str = Query("csv", description="匯出格式：csv | json | ai_json"),
    db: AsyncSession = Depends(get_db),
):
    """
    匯出 Test Cases。

    - **csv** — 適合 Excel 開啟的試算表
    - **json** — 完整結構化資料，適合系統整合
    - **ai_json** — 適合向量資料庫 ingestion（含 text + metadata 欄位）
    """
    if suite_id:
        hierarchy = (
            select(TestSuite.id)
            .where(TestSuite.id == suite_id)
            .cte(name="suite_hierarchy", recursive=True)
        )
        hierarchy = hierarchy.union_all(
            select(TestSuite.id).where(TestSuite.parent_suite_id == hierarchy.c.id)
        )
        result = await db.execute(
            select(TestCase)
            .options(selectinload(TestCase.steps))
            .where(TestCase.suite_id.in_(select(hierarchy.c.id)))
        )
    else:
        result = await db.execute(
            select(TestCase)
            .join(TestSuite)
            .options(selectinload(TestCase.steps))
            .where(TestSuite.project_id == project_id)
        )
    cases = result.scalars().all()

    if format == "csv":
        output = io.StringIO()
        max_steps = max((len(c.steps) for c in cases), default=0)
        step_headers = []
        for i in range(1, max_steps + 1):
            step_headers += [f"step_{i}_action", f"step_{i}_data", f"step_{i}_expected"]

        writer = csv.DictWriter(output, fieldnames=[
            "case_id", "suite_id", "title", "lifecycle_status", "priority",
            "automation_status", "layer", "type", "severity",
            "tags", "labels", "jira_keys", "external_id",
            "preconditions", "postconditions", *step_headers,
        ])
        writer.writeheader()
        for case in cases:
            row = {
                "case_id": f"TC-{case.id}",
                "suite_id": case.suite_id,
                "title": case.title,
                "lifecycle_status": case.lifecycle_status,
                "priority": case.priority,
                "automation_status": case.automation_status,
                "layer": case.layer or "",
                "type": case.type or "",
                "severity": case.severity,
                "tags": case.tags or "",
                "labels": case.labels or "",
                "jira_keys": case.jira_keys or "",
                "external_id": case.external_id or "",
                "preconditions": case.preconditions or "",
                "postconditions": case.postconditions or "",
            }
            for i, step in enumerate(case.steps, 1):
                row[f"step_{i}_action"] = step.action
                row[f"step_{i}_data"] = step.data or ""
                row[f"step_{i}_expected"] = step.expected_result or ""
            writer.writerow(row)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": "attachment; filename=test_cases.csv"},
        )

    elif format == "json":
        data = []
        for case in cases:
            data.append({
                "id": f"TC-{case.id}",
                "suite_id": case.suite_id,
                "title": case.title,
                "lifecycle_status": case.lifecycle_status,
                "priority": case.priority,
                "automation_status": case.automation_status,
                "layer": case.layer,
                "type": case.type,
                "severity": case.severity,
                "tags": json.loads(case.tags) if case.tags else [],
                "labels": json.loads(case.labels) if case.labels else [],
                "jira_keys": case.jira_keys,
                "external_id": case.external_id,
                "preconditions": case.preconditions,
                "postconditions": case.postconditions,
                "steps": [
                    {"order": s.order, "action": s.action, "data": s.data, "expected": s.expected_result}
                    for s in case.steps
                ],
            })
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_cases.json"},
        )

    elif format == "ai_json":
        data = []
        for case in cases:
            data.append({
                "id": f"TC-{case.id}",
                "text": build_case_text(case),
                "metadata": build_case_metadata(case),
            })
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=test_cases_ai.json"},
        )

    else:
        raise HTTPException(status_code=400, detail=f"不支援的格式：{format}。請使用 csv | json | ai_json")


@router.get("/{case_id}", response_model=TestCaseResponse)
async def get_case(case_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase).options(selectinload(TestCase.steps)).where(TestCase.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")
    return case

@router.put("/{case_id}", response_model=TestCaseResponse)
async def update_case(case_id: int, case_in: TestCaseUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestCase).options(selectinload(TestCase.steps)).where(TestCase.id == case_id))
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")
    
    update_data = case_in.model_dump(exclude={"steps"}, exclude_unset=True)
    
    # Track changed fields
    changes = {}
    for key, value in update_data.items():
        old_val = getattr(case, key)
        if old_val != value:
            changes[key] = f"{old_val} -> {value}"
        setattr(case, key, value)
    
    # Handle steps
    steps_changed = False
    if case_in.steps is not None:
        steps_changed = True
        # Simplistic approach: delete old, add new
        for step in case.steps:
            await db.delete(step)
        for step_in in case_in.steps:
            step = TestStep(**step_in.model_dump(), test_case_id=case.id)
            db.add(step)
            
    if steps_changed:
        changes["steps"] = "Steps modified"

    if changes:
        history = TestCaseHistory(
            case_id=case.id,
            user_id=1,  # Hardcoded to user 1 for now
            action="Updated",
            changed_fields=json.dumps(changes, ensure_ascii=False)
        )
        db.add(history)

    await db.commit()
    
    # Reload
    result = await db.execute(select(TestCase).options(selectinload(TestCase.steps)).where(TestCase.id == case.id))
    return result.scalar_one()

@router.delete("/batch")
async def batch_delete_cases(payload: TestCaseBatchDelete, db: AsyncSession = Depends(get_db)):
    if not payload.case_ids:
        return {"message": "No test cases provided"}

    # Fetch all the cases to ensure they exist and we can delete them
    result = await db.execute(select(TestCase).where(TestCase.id.in_(payload.case_ids)))
    cases = result.scalars().all()
    
    if not cases:
        raise HTTPException(status_code=404, detail="No matching TestCases found")
        
    for case in cases:
        await db.delete(case)
        
    await db.commit()
    return {"message": f"Successfully deleted {len(cases)} TestCases"}

@router.put("/batch-move")
async def batch_move_cases(payload: TestCaseBatchMove, db: AsyncSession = Depends(get_db)):
    if not payload.case_ids:
        return {"message": "No test cases provided"}
        
    # Verify the target folder exists
    suite = await db.get(TestSuite, payload.suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Target folder (TestSuite) not found")

    result = await db.execute(select(TestCase).where(TestCase.id.in_(payload.case_ids)))
    cases = result.scalars().all()
    
    if not cases:
        raise HTTPException(status_code=404, detail="No matching TestCases found")
        
    for case in cases:
        if case.suite_id != payload.suite_id:
            # Create history record
            history = TestCaseHistory(
                case_id=case.id,
                user_id=1,  # Hardcoded User 1
                action="Moved",
                changed_fields=json.dumps({"suite_id": f"{case.suite_id} -> {payload.suite_id}"}, ensure_ascii=False)
            )
            db.add(history)
            case.suite_id = payload.suite_id
            
    await db.commit()
    return {"message": f"Successfully moved {len(cases)} TestCases to folder {payload.suite_id}"}

@router.delete("/{case_id}")
async def delete_case(case_id: int, db: AsyncSession = Depends(get_db)):
    case = await db.get(TestCase, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="TestCase not found")
    
    await db.delete(case)
    await db.commit()
    return {"message": "TestCase deleted successfully"}

@router.get("/{case_id}/history", response_model=List[TestCaseHistoryResponse])
async def get_case_history(case_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCaseHistory)
        .options(selectinload(TestCaseHistory.user))
        .where(TestCaseHistory.case_id == case_id)
        .order_by(TestCaseHistory.created_at.desc())
    )
    return result.scalars().all()
