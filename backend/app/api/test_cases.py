from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_step import TestStep
from app.schemas.test_case import TestCaseCreate, TestCaseUpdate, TestCaseResponse

from app.models.test_suite import TestSuite

router = APIRouter()

@router.get("/project/{project_id}", response_model=List[TestCaseResponse])
async def list_cases_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCase)
        .join(TestSuite)
        .options(selectinload(TestCase.steps))
        .where(TestSuite.project_id == project_id)
    )
    return result.scalars().all()

@router.get("/suite/{suite_id}", response_model=List[TestCaseResponse])
async def list_cases_by_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TestCase).options(selectinload(TestCase.steps)).where(TestCase.suite_id == suite_id)
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
    for key, value in update_data.items():
        setattr(case, key, value)
    
    # Handle steps
    if case_in.steps is not None:
        # Simplistic approach: delete old, add new
        for step in case.steps:
            await db.delete(step)
        for step_in in case_in.steps:
            step = TestStep(**step_in.model_dump(), test_case_id=case.id)
            db.add(step)
            
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
