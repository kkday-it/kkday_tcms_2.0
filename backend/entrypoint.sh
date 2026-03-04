#!/bin/bash
set -e

echo "[entrypoint] 執行 alembic upgrade head..."
alembic upgrade head

mkdir -p /app/logs

echo "[entrypoint] 啟動 uvicorn..."
# 同時輸出到 backend.log 供 tcms/be-log 頁面使用
exec uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | tee -a /app/logs/backend.log
