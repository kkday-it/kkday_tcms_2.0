#!/usr/bin/env python
"""
SQLite → PostgreSQL 資料搬移腳本

依 FK 順序逐表搬移，保留原始 ID（需暫時關閉 PK sequence 限制）。
執行前確認 PostgreSQL tcms_* 表已建立（alembic upgrade head）。

Usage:
    python scripts/migrate_sqlite_to_pg.py
"""
import sqlite3
import psycopg2
import json
from datetime import datetime

SQLITE_PATH = "./tcms_1_5.db"
PG_DSN = "host=autotest-service.sit.kkday.com port=5432 dbname=qa_automation user=admin password=X5x6TFBmCNdxrQxK"

# 搬移順序依 FK 相依性排列
TABLES = [
    ("projects",              "tcms_projects"),
    ("users",                 "tcms_users"),
    ("test_suites",           "tcms_test_suites"),
    ("test_cases",            "tcms_test_cases"),
    ("test_cases_history",    "tcms_test_cases_history"),
    ("test_steps",            "tcms_test_steps"),
    ("test_run_folders",      "tcms_test_run_folders"),
    ("test_plan_folders",     "tcms_test_plan_folders"),
    ("test_plans",            "tcms_test_plans"),
    ("plan_cases",            "tcms_plan_cases"),
    ("test_runs",             "tcms_test_runs"),
    ("test_run_assignees",    "tcms_test_run_assignees"),
    ("plan_runs",             "tcms_plan_runs"),
    ("test_results",          "tcms_test_results"),
    ("test_step_results",     "tcms_test_step_results"),
]


def migrate():
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    pg_conn = psycopg2.connect(PG_DSN)
    pg_conn.autocommit = False

    try:
        for sqlite_table, pg_table in TABLES:
            rows = sqlite_conn.execute(f"SELECT * FROM {sqlite_table}").fetchall()
            if not rows:
                print(f"  ⏭  {sqlite_table} — 空資料，跳過")
                continue

            columns = rows[0].keys()
            col_list = ", ".join(f'"{c}"' for c in columns)
            placeholders = ", ".join(["%s"] * len(columns))

            with pg_conn.cursor() as cur:
                # 取得 PostgreSQL 欄位型別，方便 BOOLEAN 轉換
                cur.execute(f"""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = '{pg_table}' AND table_schema = 'public'
                """)
                pg_col_types = {r[0]: r[1] for r in cur.fetchall()}

                batch = []
                for row in rows:
                    values = []
                    for col, v in zip(columns, row):
                        if isinstance(v, bytes):
                            v = v.decode("utf-8", errors="replace")
                        if pg_col_types.get(col) == "boolean" and isinstance(v, int):
                            v = bool(v)
                        values.append(v)
                    batch.append(values)

                # 批次 INSERT（executemany）
                cur.executemany(
                    f'INSERT INTO {pg_table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
                    batch,
                )
                inserted = cur.rowcount if cur.rowcount >= 0 else len(batch)

                # 同步 sequence（有 id 欄位的表）
                if "id" in columns:
                    cur.execute(f"""
                        SELECT setval(
                            pg_get_serial_sequence('{pg_table}', 'id'),
                            COALESCE((SELECT MAX(id) FROM {pg_table}), 1)
                        )
                    """)

                pg_conn.commit()
                print(f"  ✅ {sqlite_table} → {pg_table}: {len(batch)} 筆")

        print("\n🎉 資料搬移完成！")

    except Exception as e:
        pg_conn.rollback()
        print(f"\n❌ 搬移失敗: {e}")
        raise
    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    print("=== SQLite → PostgreSQL Migration ===")
    migrate()
