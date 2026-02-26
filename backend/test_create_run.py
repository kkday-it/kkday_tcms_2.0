import asyncio
from app.db.database import AsyncSessionLocal
from sqlalchemy.future import select
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite

async def test_cases_query():
    async with AsyncSessionLocal() as session:
        cases_query = select(TestCase).join(TestSuite).where(TestSuite.project_id == 1).where(TestCase.id.in_([1, 2, 3]))
        cases_result = await session.execute(cases_query)
        cases = cases_result.scalars().all()
        print(f"Found {len(cases)} cases")
        
asyncio.run(test_cases_query())
