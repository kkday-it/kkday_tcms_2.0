import time

from sqlalchemy import inspect, text

from app.db.database import Base, engine

_cache: dict = {}
_CACHE_TTL = 60  # seconds


async def check_schema_health():
    """
    非破壞性地檢查資料庫結構是否與 Model 一致。
    結果 cache 60 秒，避免對 remote DB 頻繁下 introspection queries。
    回傳: (is_healthy, missing_tables, missing_columns)
    """
    now = time.monotonic()
    if _cache.get("ts") and now - _cache["ts"] < _CACHE_TTL:
        return _cache["result"]

    missing_tables: list[str] = []
    missing_columns: dict[str, list[str]] = {}

    model_tables = dict(Base.metadata.tables)

    async with engine.connect() as conn:
        # Single query: fetch all column names for all model tables at once.
        dialect = engine.dialect.name
        if dialect == "postgresql":
            table_names = list(model_tables.keys())
            rows = await conn.execute(
                text(
                    "SELECT table_name, column_name FROM information_schema.columns"
                    " WHERE table_schema = 'public' AND table_name = ANY(:names)"
                ),
                {"names": table_names},
            )
            existing: dict[str, set[str]] = {}
            for tbl, col in rows:
                existing.setdefault(tbl, set()).add(col)
        else:
            # SQLite fallback: use inspector (local dev, fast enough)
            def _sqlite_inspect(conn_sync):
                insp = inspect(conn_sync)
                tables = set(insp.get_table_names())
                result: dict[str, set[str]] = {}
                for tbl in model_tables:
                    if tbl in tables:
                        result[tbl] = {c["name"] for c in insp.get_columns(tbl)}
                return result

            existing = await conn.run_sync(_sqlite_inspect)

        for table_name, table_obj in model_tables.items():
            if table_name not in existing:
                missing_tables.append(table_name)
                continue
            missing = [c.name for c in table_obj.columns if c.name not in existing[table_name]]
            if missing:
                missing_columns[table_name] = missing

    is_healthy = not missing_tables and not missing_columns
    _cache["result"] = (is_healthy, missing_tables, missing_columns)
    _cache["ts"] = now
    return _cache["result"]
