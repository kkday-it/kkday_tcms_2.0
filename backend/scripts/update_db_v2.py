import asyncio
from sqlalchemy import text
from app.db.database import engine, Base

import app.models  # Ensures all models are loaded

async def update_schema():
    print("Starting database schema update for v2 features...")
    
    # 1. Create new tables (TestPlan, User)
    print("Creating new tables and missing relations...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    print("New tables created (if they didn't exist).")

    # 2. Add columns to existing SQLite tables using raw SQL
    async with engine.begin() as conn:
        print("Adding columns to test_cases...")
        try:
            await conn.execute(text("ALTER TABLE test_cases ADD COLUMN lifecycle_status VARCHAR DEFAULT 'Draft'"))
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                pass
            else:
                print(f"Error adding lifecycle_status: {e}")
                
        try:
            await conn.execute(text("ALTER TABLE test_cases ADD COLUMN default_owner_id INTEGER REFERENCES users(id)"))
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                pass
            else:
                print(f"Error adding default_owner_id: {e}")

        print("Adding columns to test_runs...")
        try:
            await conn.execute(text("ALTER TABLE test_runs ADD COLUMN test_plan_id INTEGER REFERENCES test_plans(id)"))
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                pass
            else:
                print(f"Error adding test_plan_id: {e}")
                
        # To handle existing Active -> Testing conversion and Completed -> Done
        try:
            await conn.execute(text("UPDATE test_runs SET status = 'Testing' WHERE status = 'Active'"))
            await conn.execute(text("UPDATE test_runs SET status = 'Done' WHERE status = 'Completed'"))
        except Exception as e:
            print(f"Error updating test_runs status data: {e}")

        print("Adding columns to test_results...")
        try:
            await conn.execute(text("ALTER TABLE test_results ADD COLUMN assignee_id INTEGER REFERENCES users(id)"))
        except Exception as e:
            if "duplicate column name" in str(e).lower():
                pass
            else:
                print(f"Error adding assignee_id: {e}")

        print("Schema update completed successfully!")

if __name__ == "__main__":
    asyncio.run(update_schema())
