#!/bin/bash
set -e

echo "[entrypoint] 執行 alembic upgrade head..."
alembic upgrade head

echo "[entrypoint] 啟動 uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
