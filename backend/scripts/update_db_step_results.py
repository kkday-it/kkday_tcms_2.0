import asyncio
from sqlalchemy import text
from app.db.database import engine, Base
import app.models  # Ensures all models are imported and registered with Base

async def main():
    async with engine.begin() as conn:
        print("Checking if test_results needs altering...")
        
        # In SQLite, ALTER TABLE ADD COLUMN runs fine even if there's no data.
        # We catch exceptions in case they already exist.
        try:
            await conn.execute(text("ALTER TABLE test_results ADD COLUMN jira_bug_id VARCHAR"))
            print("Added jira_bug_id to test_results")
        except Exception as e:
            print(f"Skipping jira_bug_id, might already exist: {e}")
            
        try:
            await conn.execute(text("ALTER TABLE test_results ADD COLUMN attachment_url VARCHAR"))
            print("Added attachment_url to test_results")
        except Exception as e:
            print(f"Skipping attachment_url, might already exist: {e}")
            
        print("Creating any missing tables (e.g. test_step_results)...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
