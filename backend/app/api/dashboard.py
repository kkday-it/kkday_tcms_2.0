from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_run import TestRun
from app.models.test_result import TestResult
from sqlalchemy import desc, text

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Total Cases
    total_cases_result = await db.execute(select(func.count(TestCase.id)))
    total_cases = total_cases_result.scalar() or 0
    
    # Active Runs
    active_runs_result = await db.execute(select(func.count(TestRun.id)).where(TestRun.status == 'Active'))
    active_runs = active_runs_result.scalar() or 0
    
    # Passed/Failed across all active runs
    query_passed = select(func.count(TestResult.id)).join(TestRun).where(TestRun.status == 'Active').where(TestResult.status == 'Passed')
    passed_result = await db.execute(query_passed)
    passed_tests = passed_result.scalar() or 0
    
    query_failed = select(func.count(TestResult.id)).join(TestRun).where(TestRun.status == 'Active').where(TestResult.status == 'Failed')
    failed_result = await db.execute(query_failed)
    failed_tests = failed_result.scalar() or 0
    
    return {
        "total_cases": total_cases,
        "active_runs": active_runs,
        "passed_tests": passed_tests,
        "failed_tests": failed_tests
    }


@router.get("/summary")
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    # 1. Total Cases & Active Runs
    total_cases = (await db.execute(select(func.count(TestCase.id)))).scalar() or 0
    active_runs = (await db.execute(select(func.count(TestRun.id)).where(TestRun.status == 'Active'))).scalar() or 0

    # 2. Total Defects (Count of unique jira_bug_id in results)
    defects_query = select(func.count(func.distinct(TestResult.jira_bug_id))).where(TestResult.jira_bug_id != None)
    total_defects = (await db.execute(defects_query)).scalar() or 0

    # 3. Runs by Type Distribution
    runs_by_type_query = select(TestRun.run_type, func.count(TestRun.id)).group_by(TestRun.run_type)
    runs_by_type_res = await db.execute(runs_by_type_query)
    run_types_distribution = [{"name": row[0] or "Unspecified", "value": row[1]} for row in runs_by_type_res.all()]

    # 4. Pass/Fail by Run Type
    # Since we use SQLite, we can use conditional aggregation or just fetch all and group in Python for simplicity/compatibility.
    pf_query = select(TestRun.run_type, TestResult.status, func.count(TestResult.id)).join(TestRun).where(TestResult.status.in_(['Passed', 'Failed'])).group_by(TestRun.run_type, TestResult.status)
    pf_res = await db.execute(pf_query)
    pf_data = {}
    for run_type, status, count in pf_res.all():
        rt = run_type or "Unspecified"
        if rt not in pf_data:
            pf_data[rt] = {"run_type": rt, "passed": 0, "failed": 0}
        if status == 'Passed':
            pf_data[rt]["passed"] = count
        elif status == 'Failed':
            pf_data[rt]["failed"] = count
    
    run_type_pass_fail = list(pf_data.values())

    # 5. Recent Test Runs
    recent_runs_query = select(TestRun).order_by(desc(TestRun.created_at)).limit(5)
    recent_runs_res = await db.execute(recent_runs_query)
    recent_runs = []
    for run in recent_runs_res.scalars().all():
        # Get pas/fail for this run
        p = (await db.execute(select(func.count(TestResult.id)).where(TestResult.run_id == run.id, TestResult.status == 'Passed'))).scalar() or 0
        f = (await db.execute(select(func.count(TestResult.id)).where(TestResult.run_id == run.id, TestResult.status == 'Failed'))).scalar() or 0
        tot = (await db.execute(select(func.count(TestResult.id)).where(TestResult.run_id == run.id))).scalar() or 0
        recent_runs.append({
            "id": run.id,
            "title": run.title,
            "status": run.status,
            "run_type": run.run_type,
            "passed": p,
            "failed": f,
            "total": tot
        })

    # 6. Top Failing Test Cases
    # Count how many times a case has failed
    top_failing_query = (
        select(TestCase.title, func.count(TestResult.id).label("fail_count"))
        .join(TestResult, TestCase.id == TestResult.case_id)
        .where(TestResult.status == 'Failed')
        .group_by(TestCase.id, TestCase.title)
        .order_by(desc("fail_count"))
        .limit(5)
    )
    top_failing_res = await db.execute(top_failing_query)
    top_failing_cases = [{"title": row[0], "fail_count": row[1]} for row in top_failing_res.all()]

    return {
        "summary_cards": {
            "total_cases": total_cases,
            "active_runs": active_runs,
            "total_defects": total_defects
        },
        "run_types_distribution": run_types_distribution,
        "run_type_pass_fail": run_type_pass_fail,
        "recent_runs": recent_runs,
        "top_failing_cases": top_failing_cases
    }
