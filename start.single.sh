#!/bin/bash
# start.single.sh — 本機(無 docker)驗證「FE/BE 整併」後的單一 process 形態：
#   一個 uvicorn 同時 serve 前端 dist + API，單一 port，無 Vite dev server、無 nginx。
#
# ⚠️ 這不是日常開發用的。日常開發請照舊 `bash start.sh`（Vite 熱重載，FE/BE 雙 process）。
#    本腳本用來驗證整併後「上線形態」是否正確：SPA 路由、同源 API、靜態檔皆由 FastAPI 提供。
#
# 停止：沿用 `bash stop.sh`（它會 kill `uvicorn main:app`）。

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PORT="${PORT:-19425}"

echo "[1/2] Building frontend (base=/ , api=/api/v1) ..."
cd "$FRONTEND_DIR" || exit 1
VITE_API_URL=/api/v1 VITE_BASE_URL=/ npm run build || { echo "❌ frontend build failed"; exit 1; }

echo "[2/2] Starting single uvicorn (serves dist + API) on :$PORT ..."
cd "$BACKEND_DIR" || exit 1
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d ".test_venv" ]; then
    source .test_venv/bin/activate
fi
mkdir -p "$PROJECT_DIR/logs"

# FRONTEND_DIST → main.py 的 catch-all 由此讀取前端 dist
# ROOT_PATH=   → 本機直連，不掛 /tcms 子路徑
FRONTEND_DIST="$FRONTEND_DIR/dist" ROOT_PATH= \
    nohup uvicorn main:app --host 0.0.0.0 --port "$PORT" > "$PROJECT_DIR/logs/backend.log" 2>&1 &

echo "✅ 單一容器形態已啟動 (PID $!)"
echo "   → http://localhost:$PORT/        (前端 + API 同一 port)"
echo "   → http://localhost:$PORT/api/v1/health"
echo "   logs: logs/backend.log｜停止: bash stop.sh"
