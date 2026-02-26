from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from datetime import datetime, timezone

from app.db.database import get_db
from app.models.test_run import TestRun
from app.models.test_result import TestResult
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite
from sqlalchemy import func, case
from app.schemas.test_run import TestRunCreate, TestRunUpdate, TestRunResponse

router = APIRouter()

@router.get("/project/{project_id}", response_model=List[TestRunResponse])
async def list_runs_by_project(project_id: int, db: AsyncSession = Depends(get_db)):
    # Query TestRuns and left join TestResults to calculate passed/failed/untested
    query = (
        select(
            TestRun,
            func.sum(case((TestResult.status == 'Passed', 1), else_=0)).label('passed_count'),
            func.sum(case((TestResult.status == 'Failed', 1), else_=0)).label('failed_count'),
            func.sum(case((TestResult.status == 'Untested', 1), else_=0)).label('untested_count'),
        )
        .outerjoin(TestResult, TestRun.id == TestResult.run_id)
        .where(TestRun.project_id == project_id)
        .group_by(TestRun.id)
    )
    result = await db.execute(query)
    rows = result.all()
    
    # Map back to Pydantic schema
    response_list = []
    for run_obj, passed, failed, untested in rows:
        run_data = run_obj.__dict__
        run_data['passed'] = passed or 0
        run_data['failed'] = failed or 0
        run_data['untested'] = untested or 0
        response_list.append(run_data)
        
    return response_list

@router.post("/", response_model=TestRunResponse)
async def create_run(run_in: TestRunCreate, db: AsyncSession = Depends(get_db)):
    # 1. Create the TestRun
    run_data = run_in.model_dump(exclude={"case_ids"})
    run = TestRun(**run_data)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    
    # 2. Fetch all TestCases for this project (join via TestSuite)
    cases_query = select(TestCase).join(TestSuite).where(TestSuite.project_id == run.project_id)
    if run_in.case_ids is not None and len(run_in.case_ids) > 0:
        cases_query = cases_query.where(TestCase.id.in_(run_in.case_ids))
        
    cases_result = await db.execute(cases_query)
    cases = cases_result.scalars().all()
    
    # 3. Create a TestResult for each TestCase
    results_to_insert = []
    for case in cases:
        results_to_insert.append(TestResult(
            run_id=run.id,
            case_id=case.id,
            status="Untested",
            assignee_id=case.default_owner_id
        ))
    
    if results_to_insert:
        db.add_all(results_to_insert)
        await db.commit()
        
    # Prepare response data
    run_dict = run.__dict__
    run_dict['passed'] = 0
    run_dict['failed'] = 0
    run_dict['untested'] = len(cases)
        
    return run_dict

@router.get("/{run_id}", response_model=TestRunResponse)
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")
    return run

@router.put("/{run_id}", response_model=TestRunResponse)
async def update_run(run_id: int, run_in: TestRunUpdate, db: AsyncSession = Depends(get_db)):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")
    
    update_data = run_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(run, key, value)
    
    if run.status == "Done" and run.completed_at is None:
        run.completed_at = datetime.now(timezone.utc)
    elif run.status != "Done":
        run.completed_at = None
        
    await db.commit()
    await db.refresh(run)
    return run

@router.delete("/{run_id}")
async def delete_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TestRun not found")
    
    await db.delete(run)
    await db.commit()
    return {"message": "TestRun deleted successfully"}

@router.post("/{run_id}/duplicate", response_model=TestRunResponse)
async def duplicate_run(run_id: int, db: AsyncSession = Depends(get_db)):
    # 1. Fetch original run
    original_run = await db.get(TestRun, run_id)
    if not original_run:
        raise HTTPException(status_code=404, detail="Original TestRun not found")
    
    # 2. Create the duplicated run
    run_data = original_run.__dict__.copy()
    run_data.pop("_sa_instance_state", None)
    run_data.pop("id", None)
    run_data.pop("created_at", None)
    run_data.pop("updated_at", None)
    run_data.pop("completed_at", None)
    run_data["title"] = f"{run_data.get('title', 'Duplicate')} (Copy)"
    run_data["status"] = "Active"
    
    new_run = TestRun(**run_data)
    db.add(new_run)
    await db.commit()
    await db.refresh(new_run)
    
    # 3. Duplicate TestResults linked to original run
    # Fetch original test cases
    results_query = select(TestResult).where(TestResult.run_id == original_run.id)
    results_query_result = await db.execute(results_query)
    original_results = results_query_result.scalars().all()
    
    results_to_insert = []
    for og_res in original_results:
        results_to_insert.append(TestResult(
            run_id=new_run.id,
            case_id=og_res.case_id,
            status="Untested"
        ))
    
    if results_to_insert:
        db.add_all(results_to_insert)
        await db.commit()
        
    # Prepare response data
    run_dict = new_run.__dict__
    run_dict['passed'] = 0
    run_dict['failed'] = 0
    run_dict['untested'] = len(original_results)
        
    return run_dict
