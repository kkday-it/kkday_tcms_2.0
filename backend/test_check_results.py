import asyncio
from app.db.database import AsyncSessionLocal
from sqlalchemy.future import select
from app.models.test_result import TestResult

async def check():
    async with AsyncSessionLocal() as session:
        query = select(TestResult).where(TestResult.run_id == 6)
        res = await session.execute(query)
        results = res.scalars().all()
        print(f"Run 6 has {len(results)} results")
        
asyncio.run(check())
