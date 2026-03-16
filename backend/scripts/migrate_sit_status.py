import asyncio
import sys
import os

# Add the parent directory to sys.path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.database import engine

async def migrate():
    print("Connecting to database to add 'status' column to 'tcms_test_steps'...")
    try:
        async with engine.connect() as conn:
            # For PostgreSQL 9.6+, we can use ADD COLUMN IF NOT EXISTS
            # For older versions or SQLite, we can try-except
            print("Attempting to add status column...")
            try:
                # Try PostgreSQL-specific syntax first
                await conn.execute(text("ALTER TABLE tcms_test_steps ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Active';"))
                await conn.commit()
                print("Migration successful: Column 'status' handled.")
            except Exception as e:
                # Fallback or specific error handling (e.g. for SQLite which doesn't support IF NOT EXISTS in ALTER)
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("Column 'status' already exists. Nothing to do.")
                elif "syntax error" in str(e).lower() and "IF NOT EXISTS" in str(e):
                    # SQLite fallback
                    print("PostgreSQL-specific syntax failed, trying standard ALTER TABLE...")
                    try:
                        await conn.execute(text("ALTER TABLE tcms_test_steps ADD COLUMN status VARCHAR DEFAULT 'Active';"))
                        await conn.commit()
                        print("Migration successful: Column 'status' added.")
                    except Exception as inner_e:
                        if "duplicate column" in str(inner_e).lower() or "already exists" in str(inner_e).lower():
                            print("Column 'status' already exists. Nothing to do.")
                        else:
                            raise inner_e
                else:
                    raise e

    except Exception as e:
        print(f"Error during migration: {e}")
        print("\nNote: This script requires ALTER TABLE permissions.")
        print("Ensure your network can reach the SIT database if running against SIT.")

if __name__ == "__main__":
    asyncio.run(migrate())
