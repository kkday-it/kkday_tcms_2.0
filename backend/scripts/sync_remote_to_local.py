import sqlite3
import asyncio
import json
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

# --- 配置 ---
from urllib.parse import quote_plus

from app.core.secrets import get_secret


def _resolve_remote_url() -> str:
    data = get_secret(key="qa_database", return_value=True)
    if not data or not isinstance(data, dict):
        raise ValueError("qa_database secret not found or invalid")
    user = data.get("user", "")
    pw = data.get("password", "") or data.get("pass", "")
    host = data.get("host", "")
    port = data.get("port", 5432)
    db = data.get("database", "")
    return f"postgresql+asyncpg://{user}:{quote_plus(str(pw))}@{host}:{port}/{db}"


def _resolve_local_db_path() -> str:
    # Allow override, default to backend/tcms_1_5.db (same folder as this script's parent)
    override = os.environ.get("TCMS_LOCAL_DB_PATH")
    if override:
        return override
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return os.path.join(backend_dir, "tcms_1_5.db")


REMOTE_URL: str | None = None
LOCAL_DB_PATH: str | None = None

# 要同步的表格清單
TABLES_TO_SYNC = [
    "tcms_users",
    "tcms_projects",
    "tcms_test_suites",
    "tcms_test_cases",
    "tcms_test_plans",
    "tcms_test_runs",
    "tcms_test_results",
    "tcms_test_steps",
    "tcms_test_step_results",
    "tcms_plan_cases",
    "tcms_plan_runs",
    "tcms_test_run_folders",
    "tcms_test_plan_folders",
    "tcms_test_cases_history",
    "tcms_test_plans_history",
    "tcms_test_runs_history"
]

import shutil
from datetime import datetime

async def sync_tables():
    print(f"🚀 開始從 SIT 同步資料到本地 SQLite...")

    global REMOTE_URL, LOCAL_DB_PATH
    if REMOTE_URL is None:
        REMOTE_URL = _resolve_remote_url()
    if LOCAL_DB_PATH is None:
        LOCAL_DB_PATH = _resolve_local_db_path()
    
    # --- 自動備份機制 ---
    if os.path.exists(LOCAL_DB_PATH):
        # 建立簡單的 .bak 備份，以及帶時間戳記的備份 (放在 logs/backups)
        backup_dir = os.path.join(os.path.dirname(LOCAL_DB_PATH), "../logs/backups")
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ts_backup = os.path.join(backup_dir, f"tcms_1_5_{timestamp}.db.bak")
        shutil.copy2(LOCAL_DB_PATH, ts_backup)
        
        # 同時保留一個最新的快捷備份
        shutil.copy2(LOCAL_DB_PATH, LOCAL_DB_PATH + ".bak")
        print(f"🛡️ 已完成本地資料庫備份: {os.path.basename(ts_backup)}")

    remote_engine = create_async_engine(REMOTE_URL)
    local_conn = sqlite3.connect(LOCAL_DB_PATH)
    local_cursor = local_conn.cursor()

    try:
        async with remote_engine.connect() as remote_conn:
            for table in TABLES_TO_SYNC:
                print(f"📦 同步表格: {table}...")
                
                # 1. 從 Remote 抓取資料
                result = await remote_conn.execute(text(f"SELECT * FROM {table}"))
                rows = result.fetchall()
                cols = result.keys()
                
                if not rows:
                    print(f"⚠️ {table} 無資料，略過。")
                    continue

                # 2. 清理本地表格資料 (確保不重複)
                local_cursor.execute(f"DELETE FROM {table}")
                
                # 3. 準備插入語句 (使用引號包裹欄位名，避免 SQLite 關鍵字衝突，如 "order")
                quoted_cols = [f'"{col}"' for col in cols]
                placeholders = ", ".join(["?"] * len(cols))
                insert_sql = f"INSERT INTO {table} ({', '.join(quoted_cols)}) VALUES ({placeholders})"
                
                # 4. 寫入本地
                # SQLite 需要處理不可序列化的資料類型 (如 JSONB)
                formatted_rows = []
                for row in rows:
                    formatted_row = []
                    for val in row:
                        if isinstance(val, (dict, list)):
                            formatted_row.append(json.dumps(val))
                        else:
                            formatted_row.append(val)
                    formatted_rows.append(tuple(formatted_row))
                
                local_cursor.executemany(insert_sql, formatted_rows)
                print(f"✅ {table} 同步完成 ({len(rows)} 筆資料)")

        local_conn.commit()
        print("\n✨ 全部資料同步完成！您的本地環境現在與 SIT 同步了。")

    except Exception as e:
        print(f"❌ 同步失敗: {e}")
        local_conn.rollback()
    finally:
        local_conn.close()
        await remote_engine.dispose()

if __name__ == "__main__":
    try:
        LOCAL_DB_PATH = _resolve_local_db_path()
        if not os.path.exists(LOCAL_DB_PATH):
            print(f"錯誤: 找不到本地資料庫 {LOCAL_DB_PATH}")
        else:
            asyncio.run(sync_tables())
    except Exception as e:
        print(f"❌ 初始化失敗: {e}")
