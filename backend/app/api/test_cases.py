from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_step import TestStep
from app.models.test_case_history import TestCaseHistory
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate, TestCaseResponse
from app.schemas.test_case_history import TestCaseHistoryResponse
import json

from app.models.test_suite import TestSuite

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
