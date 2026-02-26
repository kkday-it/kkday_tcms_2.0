import asyncio
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.future import select

from app.db.database import SQLALCHEMY_DATABASE_URL
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite

engine = create_async_engine(SQLALCHEMY_DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def test_query():
    async with AsyncSessionLocal() as session:
        # Check total cases
        query1 = select(TestCase)
        result1 = await session.execute(query1)
        cases1 = result1.scalars().all()
        print(f"Total test cases in DB: {len(cases1)}")

        # Check total suites
        query2 = select(TestSuite)
        result2 = await session.execute(query2)
        suites = result2.scalars().all()
        print(f"Total test suites in DB: {len(suites)}")

asyncio.run(test_query())
