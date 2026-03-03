from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_run import TestRun
from app.models.test_result import TestResult
from sqlalchemy import desc, case

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
    pf_query = select(
        TestRun.run_type, 
        TestResult.status, 
        func.count(TestResult.id)
    ).join(TestRun).where(TestResult.status.in_(['Passed', 'Failed', 'Blocked'])).group_by(TestRun.run_type, TestResult.status)
    pf_res = await db.execute(pf_query)
    pf_data = {}
    for run_type, status, count in pf_res.all():
        rt = run_type or "Unspecified"
        if rt not in pf_data:
            pf_data[rt] = {"run_type": rt, "passed": 0, "failed": 0, "blocked": 0}
        if status == 'Passed':
            pf_data[rt]["passed"] = count
        elif status == 'Failed':
            pf_data[rt]["failed"] = count
        elif status == 'Blocked':
            pf_data[rt]["blocked"] = count
    
    run_type_pass_fail = list(pf_data.values())

    # 5. Recent Test Runs (batch stats in one query, avoid N+1)
    recent_runs_query = select(TestRun).order_by(desc(TestRun.created_at)).limit(5)
    recent_runs_res = await db.execute(recent_runs_query)
    runs = recent_runs_res.scalars().all()
    run_ids = [r.id for r in runs]
    stats_map = {}
    if run_ids:
        stats_query = select(
            TestResult.run_id,
            func.sum(case((TestResult.status == 'Passed', 1), else_=0)).label('p'),
            func.sum(case((TestResult.status == 'Failed', 1), else_=0)).label('f'),
            func.sum(case((TestResult.status == 'Blocked', 1), else_=0)).label('b'),
            func.count(TestResult.id).label('tot')
        ).where(TestResult.run_id.in_(run_ids)).group_by(TestResult.run_id)
        stats_res = await db.execute(stats_query)
        stats_map = {
            row[0]: (row[1] or 0, row[2] or 0, row[3] or 0, row[4] or 0)
            for row in stats_res.all()
        }
    recent_runs = [
        {
            "id": run.id,
            "title": run.title,
            "status": run.status,
            "run_type": run.run_type,
            "passed": stats_map.get(run.id, (0, 0, 0, 0))[0],
            "failed": stats_map.get(run.id, (0, 0, 0, 0))[1],
            "blocked": stats_map.get(run.id, (0, 0, 0, 0))[2],
            "total": stats_map.get(run.id, (0, 0, 0, 0))[3],
        }
        for run in runs
    ]

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

from datetime import datetime, timedelta, timezone

@router.get("/me")
async def get_my_dashboard(user_id: int, db: AsyncSession = Depends(get_db)):
    # 1. Assigned Active Test Runs (batch stats in one query, avoid N+1)
    assigned_runs_query = select(TestRun).where(
        (TestRun.assignee_id == user_id) & 
        (TestRun.status.in_(["Pending", "Testing"]))
    ).order_by(desc(TestRun.created_at)).limit(10)
    assigned_runs_res = await db.execute(assigned_runs_query)
    runs = assigned_runs_res.scalars().all()
    run_ids = [r.id for r in runs]
    stats_map = {}
    if run_ids:
        stats_query = select(
            TestResult.run_id,
            func.sum(case((TestResult.status == 'Passed', 1), else_=0)).label('p'),
            func.sum(case((TestResult.status == 'Failed', 1), else_=0)).label('f'),
            func.sum(case((TestResult.status == 'Blocked', 1), else_=0)).label('b'),
            func.count(TestResult.id).label('tot')
        ).where(TestResult.run_id.in_(run_ids)).group_by(TestResult.run_id)
        stats_res = await db.execute(stats_query)
        stats_map = {
            row[0]: (row[1] or 0, row[2] or 0, row[3] or 0, row[4] or 0)
            for row in stats_res.all()
        }
    assigned_runs = []
    for run in runs:
        p, f, b, tot = stats_map.get(run.id, (0, 0, 0, 0))
        assigned_runs.append({
            "id": run.id,
            "title": run.title,
            "status": run.status,
            "passed": p,
            "failed": f,
            "blocked": b,
            "untested": tot - p - f - b,
            "total": tot
        })
        
    # 2. My Automation Coverage
    # Cases owned by this user
    my_cases_query = select(
        func.count(TestCase.id).label("total"),
        func.sum(case((TestCase.automation_status == 'Automated', 1), else_=0)).label("automated")
    ).where(TestCase.default_owner_id == user_id)
    
    my_cases_res = await db.execute(my_cases_query)
    my_cases_row = my_cases_res.first()
    my_cases_total = my_cases_row.total if my_cases_row else 0
    my_cases_automated = my_cases_row.automated if my_cases_row else 0
    
    # 3. My Recent Executions (Last 7 days)
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_exec_query = select(func.count(TestResult.id)).where(
        (TestResult.assignee_id == user_id) &
        (TestResult.executed_at >= seven_days_ago)
    )
    recent_exec_res = await db.execute(recent_exec_query)
    recent_executions_count = recent_exec_res.scalar() or 0
    
    return {
        "assigned_runs": assigned_runs,
        "metrics": {
            "cases_owned": my_cases_total,
            "cases_automated": my_cases_automated,
            "recent_executions_7d": recent_executions_count
        }
    }
