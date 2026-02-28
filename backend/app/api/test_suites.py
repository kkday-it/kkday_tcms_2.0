from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List

from app.db.database import get_db
from app.models.test_suite import TestSuite
from app.models.test_case import TestCase
from app.schemas.test_suite import TestSuiteCreate, TestSuiteUpdate, TestSuiteResponse

router = APIRouter()

@router.get("/project/{project_id}", response_model=List[TestSuiteResponse])
async def list_suites_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    # We need to join with TestCase to get the direct count first
    stmt = (
        select(
            TestSuite,
            func.count(TestCase.id).label("cases")
        )
        .outerjoin(TestCase, TestCase.suite_id == TestSuite.id)
        .where(TestSuite.project_id == project_id)
        .group_by(TestSuite.id)
    )
    result = await db.execute(stmt)
    
    # Map raw rows to Pydantic-compatible dicts
    suites = []
    suite_dicts = {}
    
    for suite, case_count in result.all():
        suite_dict = suite.__dict__.copy()
        suite_dict["cases"] = case_count
        suite_dicts[suite.id] = suite_dict
        suites.append(suite_dict)
        
    # Calculate cumulative cases
    def get_cumulative_cases(suite_id):
        s = suite_dicts[suite_id]
        if "cumulative_cases" in s:
            return s["cumulative_cases"]
            
        total = s["cases"]
        children = [child for child in suites if child["parent_suite_id"] == suite_id]
        for child in children:
            total += get_cumulative_cases(child["id"])
            
        s["cumulative_cases"] = total
        return total
        
    for suite in suites:
        suite["cases"] = get_cumulative_cases(suite["id"])
        suite.pop("cumulative_cases", None)
        
    return suites

@router.post("/", response_model=TestSuiteResponse)
async def create_suite(suite_in: TestSuiteCreate, db: AsyncSession = Depends(get_db)):
    suite = TestSuite(**suite_in.model_dump())
    db.add(suite)
    await db.commit()
    await db.refresh(suite)
    
    suite_dict = suite.__dict__.copy()
    suite_dict["cases"] = 0
    return suite_dict

@router.get("/{suite_id}", response_model=TestSuiteResponse)
async def get_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            TestSuite,
            func.count(TestCase.id).label("cases")
        )
        .outerjoin(TestCase, TestCase.suite_id == TestSuite.id)
        .where(TestSuite.id == suite_id)
        .group_by(TestSuite.id)
    )
    result = await db.execute(stmt)
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="TestSuite not found")
        
    suite, case_count = row
    suite_dict = suite.__dict__.copy()
    suite_dict["cases"] = case_count
    return suite_dict

@router.put("/{suite_id}", response_model=TestSuiteResponse)
async def update_suite(suite_id: int, suite_in: TestSuiteUpdate, db: AsyncSession = Depends(get_db)):
    suite = await db.get(TestSuite, suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="TestSuite not found")
    
    update_data = suite_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(suite, key, value)
    
    await db.commit()
    await db.refresh(suite)
    
    # get cases count
    cases_result = await db.execute(select(func.count(TestCase.id)).where(TestCase.suite_id == suite.id))
    case_count = cases_result.scalar() or 0
    
    suite_dict = suite.__dict__.copy()
    suite_dict["cases"] = case_count
    return suite_dict

@router.delete("/{suite_id}")
async def delete_suite(suite_id: int, db: AsyncSession = Depends(get_db)):
    suite = await db.get(TestSuite, suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="TestSuite not found")
    
    await db.delete(suite)
    await db.commit()
    return {"message": "TestSuite deleted successfully"}
