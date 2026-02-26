from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from datetime import datetime, timezone

from app.db.database import get_db
from app.models.test_result import TestResult
from app.models.test_case import TestCase
from app.models.test_step import TestStep
from app.models.test_step_result import TestStepResult
from app.schemas.test_result import TestResultUpdate, TestResultResponse
from app.schemas.test_step_result import TestStepResultUpdate

router = APIRouter()

@router.get("/run/{run_id}", response_model=List[dict])
async def get_results_by_run(run_id: int, db: AsyncSession = Depends(get_db)):
    # Join TestResult and TestCase to return result data + case details
    query = (
        select(TestResult, TestCase.title, TestCase.external_id, TestCase.priority)
        .join(TestCase, TestResult.case_id == TestCase.id)
        .where(TestResult.run_id == run_id)
    )
    result = await db.execute(query)
    rows = result.all()
    
    response_list = []
    for test_result, title, external_id, priority in rows:
        response_list.append({
            "id": test_result.id,
            "run_id": test_result.run_id,
            "case_id": test_result.case_id,
            "status": test_result.status,
            "duration_ms": test_result.duration_ms,
            "comment": test_result.comment,
            "assignee_id": test_result.assignee_id,
            "executed_at": test_result.executed_at.isoformat() if test_result.executed_at else None,
            "test_case": {
                "title": title,
                "external_id": external_id,
                "priority": priority
            }
        })
    
    return response_list

@router.get("/{result_id}/details")
async def get_result_details(result_id: int, db: AsyncSession = Depends(get_db)):
    # Fetch result
    result = await db.get(TestResult, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="TestResult not found")
        
    # Fetch case
    test_case = await db.get(TestCase, result.case_id)
    
    # Fetch steps and their existing results
    steps_query = select(TestStep).where(TestStep.test_case_id == test_case.id).order_by(TestStep.order)
    steps_res = await db.execute(steps_query)
    steps = steps_res.scalars().all()
    
    step_results_query = select(TestStepResult).where(TestStepResult.test_result_id == result_id)
    step_results_res = await db.execute(step_results_query)
    step_results = step_results_res.scalars().all()
    
    # Map step results by step_id
    step_result_map = {sr.test_step_id: sr for sr in step_results}
    
    # Format steps combining definitions and results
    steps_data = []
    for step in steps:
        sr = step_result_map.get(step.id)
        steps_data.append({
            "step_id": step.id,
            "order": step.order,
            "action": step.action,
            "data": step.data,
            "expected_result": step.expected_result,
            "status": sr.status if sr else "Untested",
            "actual_result": sr.actual_result if sr else "",
            "step_result_id": sr.id if sr else None
        })
        
    return {
        "id": result.id,
        "run_id": result.run_id,
        "case_id": result.case_id,
        "status": result.status,
        "jira_bug_id": result.jira_bug_id,
        "attachment_url": result.attachment_url,
        "comment": result.comment,
        "assignee_id": result.assignee_id,
        "test_case": {
            "title": test_case.title,
            "description": test_case.description,
            "preconditions": test_case.preconditions,
            "priority": test_case.priority
        },
        "steps": steps_data
    }

@router.put("/{result_id}/steps/{step_id}")
async def update_step_result(result_id: int, step_id: int, step_in: dict, db: AsyncSession = Depends(get_db)):
    # Check if a TestStepResult already exists
    query = select(TestStepResult).where(
        (TestStepResult.test_result_id == result_id) & 
        (TestStepResult.test_step_id == step_id)
    )
    res = await db.execute(query)
    step_res = res.scalars().first()
    
    if step_res:
        if "status" in step_in:
            step_res.status = step_in["status"]
        if "actual_result" in step_in:
            step_res.actual_result = step_in["actual_result"]
    else:
        # Create a new one
        step_res = TestStepResult(
            test_result_id=result_id,
            test_step_id=step_id,
            status=step_in.get("status", "Untested"),
            actual_result=step_in.get("actual_result", "")
        )
        db.add(step_res)
        
    await db.commit()
    await db.refresh(step_res)
    return step_res

@router.put("/{result_id}", response_model=TestResultResponse)
async def update_test_result(result_id: int, result_in: TestResultUpdate, db: AsyncSession = Depends(get_db)):
    test_result = await db.get(TestResult, result_id)
    if not test_result:
        raise HTTPException(status_code=404, detail="TestResult not found")
    
    update_data = result_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(test_result, key, value)
    
    # If status changed to anything but Untested, record the execution time
    if test_result.status != "Untested" and test_result.executed_at is None:
        test_result.executed_at = datetime.now(timezone.utc)
        
    await db.commit()
    await db.refresh(test_result)
    return test_result
