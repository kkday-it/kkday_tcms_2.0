from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete, insert
from typing import List

from app.db.database import get_db
from app.models.test_plan import TestPlan, plan_runs, plan_cases
from app.models.test_run import TestRun
from app.models.test_case import TestCase
from app.schemas.test_plan import TestPlanCreate, TestPlanUpdate, TestPlanResponse

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


@router.get("/project/{project_id}", response_model=List[TestPlanResponse])
async def get_test_plans_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestPlan)
        .options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
        .where(TestPlan.project_id == project_id)
    )
    return [_plan_to_response(p) for p in result.scalars().all()]


@router.get("/", response_model=List[TestPlanResponse])
async def get_test_plans(project_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(TestPlan).options(selectinload(TestPlan.linked_runs), selectinload(TestPlan.linked_cases))
    if project_id:
        query = query.where(TestPlan.project_id == project_id)
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

    await db.commit()
    return _plan_to_response(await _load_plan(db, plan_id))


@router.delete("/{plan_id}")
async def delete_test_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    db_plan = await db.get(TestPlan, plan_id)
    if not db_plan:
        raise HTTPException(status_code=404, detail="Test Plan not found")
    await db.delete(db_plan)
    await db.commit()
    return {"message": "Test Plan deleted"}
