from fastapi import APIRouter
from app.db.health import check_schema_health

router = APIRouter()

@router.get("/status")
async def get_system_status():
    is_healthy, missing_tables, missing_columns = await check_schema_health()
    
    return {
        "database": {
            "healthy": is_healthy,
            "missing_tables": missing_tables,
            "missing_columns": missing_columns,
            "message": "Schema is up to date" if is_healthy else "Database schema is outdated. Manual synchronization required."
        }
    }
