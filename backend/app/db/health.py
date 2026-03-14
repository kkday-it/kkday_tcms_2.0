from sqlalchemy import inspect
from app.db.database import engine, Base

async def check_schema_health():
    """
    非破壞性地檢查資料庫結構是否與 Model 一致。
    回傳: (is_healthy, missing_tables, missing_columns)
    """
    missing_tables = []
    missing_columns = {}
    
    def sync_check(conn):
        inspector = inspect(conn)
        existing_tables = inspector.get_table_names()
        
        for table_name, table_obj in Base.metadata.tables.items():
            if table_name not in existing_tables:
                missing_tables.append(table_name)
                continue
            
            # 檢查欄位
            existing_cols = [c["name"] for c in inspector.get_columns(table_name)]
            model_cols = [c.name for c in table_obj.columns]
            
            missing = [c for c in model_cols if c not in existing_cols]
            if missing:
                missing_columns[table_name] = missing
        
        return len(missing_tables) == 0 and len(missing_columns) == 0

    async with engine.connect() as conn:
        is_healthy = await conn.run_sync(sync_check)
        
    return is_healthy, missing_tables, missing_columns
