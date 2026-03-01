#!/usr/bin/env python3
"""
SQLite → PostgreSQL 資料搬移腳本

使用方式：
    python scripts/migrate_sqlite_to_pg.py \
        --sqlite  ./data/tcms_1_5.db \
        --pg      postgresql://tcms:password@localhost:5432/tcms

注意事項：
    - 執行前請確認 PostgreSQL 已透過 `alembic upgrade head` 建立所有資料表
    - 腳本採用「先清空、再插入」策略，可重複執行（idempotent）
    - 依資料量大小，5000 筆 case 約需 10~30 秒
"""

import argparse
import sys
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import create_engine, inspect, text


TABLES_IN_ORDER = [
    "users",
    "projects",
    "test_plan_folders",
    "test_suites",
    "test_cases",
    "test_steps",
    "test_cases_history",
    "test_run_folders",
    "test_plans",
    "test_runs",
    "test_results",
    "test_step_results",
    "test_run_assignees",
    "plan_runs",
    "plan_cases",
]


def get_engine(url: str):
    # 將 async driver prefix 換成同步版，供此腳本使用
    url = (
        url
        .replace("sqlite+aiosqlite", "sqlite")
        .replace("postgresql+asyncpg", "postgresql+psycopg2")
    )
    return create_engine(url, echo=False)


def migrate(sqlite_url: str, pg_url: str) -> None:
    print(f"[{now()}] 連線 SQLite: {sqlite_url}")
    src = get_engine(sqlite_url)

    print(f"[{now()}] 連線 PostgreSQL: {pg_url}")
    dst = get_engine(pg_url)

    src_inspector = inspect(src)
    dst_inspector = inspect(dst)
    src_tables = src_inspector.get_table_names()
    dst_tables = dst_inspector.get_table_names()

    # 確認 PostgreSQL 已建表
    missing = [t for t in TABLES_IN_ORDER if t not in dst_tables and t in src_tables]
    if missing:
        print(f"[ERROR] PostgreSQL 缺少以下資料表，請先執行 `alembic upgrade head`：")
        for t in missing:
            print(f"  - {t}")
        sys.exit(1)

    print(f"[{now()}] 開始搬移資料...\n")

    with src.connect() as src_conn, dst.connect() as dst_conn:
        # 關閉 FK 檢查以避免順序問題（PostgreSQL）
        dst_conn.execute(text("SET session_replication_role = 'replica';"))

        for table in TABLES_IN_ORDER:
            if table not in src_tables:
                print(f"  ⚠️  {table}: SQLite 無此資料表，跳過")
                continue

            rows = src_conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
            count = len(rows)

            if count == 0:
                print(f"  ○  {table}: 空資料表，跳過")
                continue

            # 清空目的地資料表
            dst_conn.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;"))

            # 批次插入
            if rows:
                meta = sa.MetaData()
                meta.reflect(bind=dst, only=[table])
                tbl = meta.tables[table]
                dst_conn.execute(tbl.insert(), [dict(r) for r in rows])

            dst_conn.commit()
            print(f"  ✅  {table}: {count} 筆")

        # 恢復 FK 檢查
        dst_conn.execute(text("SET session_replication_role = 'origin';"))
        dst_conn.commit()

    # 重置 PostgreSQL sequences（避免 PK 衝突）
    print(f"\n[{now()}] 重置 PostgreSQL sequences...")
    with dst.connect() as conn:
        for table in TABLES_IN_ORDER:
            if table not in dst_tables:
                continue
            try:
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                    f"COALESCE(MAX(id), 1)) FROM {table};"
                ))
                conn.commit()
            except Exception:
                conn.rollback()

    print(f"\n[{now()}] ✅ 資料搬移完成！")
    print("=" * 50)
    print("後續步驟：")
    print("  1. 確認資料正確性")
    print("  2. 將 backend DATABASE_URL 切換為 PostgreSQL")
    print("  3. 重啟 backend container")


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SQLite → PostgreSQL 資料搬移")
    parser.add_argument("--sqlite", required=True, help="SQLite 檔案路徑，e.g. ./data/tcms_1_5.db")
    parser.add_argument("--pg", required=True, help="PostgreSQL URL，e.g. postgresql://tcms:pw@localhost:5432/tcms")
    args = parser.parse_args()

    sqlite_url = args.sqlite
    if not sqlite_url.startswith("sqlite"):
        sqlite_url = f"sqlite:///{sqlite_url}"

    migrate(sqlite_url, args.pg)
