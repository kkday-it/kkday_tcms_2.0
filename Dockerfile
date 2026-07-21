# 單一容器：前端 build → 併入後端 image，由 FastAPI(StaticFiles catch-all) 一起 serve。
# build context 為 repo root（才能同時取用 frontend/ 與 backend/）：
#   docker compose -f docker-compose.single.yml up -d --build

# ── Stage 1: 建置前端 (Vite) ──────────────────────────────────────────────────
FROM node:20-alpine AS fe-build
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# 掛在 /tcms 時保持預設；本機直連 port 測試時覆蓋成 / 與 /api/v1：
#   --build-arg VITE_API_URL=/api/v1 --build-arg VITE_BASE_URL=/
ARG VITE_API_URL=/tcms/api/v1
ARG VITE_BASE_URL=/tcms/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_URL=$VITE_BASE_URL
RUN npm run build

# ── Stage 2: 後端 + serve 前端 dist ───────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/data /app/uploads

COPY backend/ .

# 前端 build 產物併入 image；main.py 以 FRONTEND_DIST 讀取此目錄
COPY --from=fe-build /fe/dist /app/static
ENV FRONTEND_DIST=/app/static

# 啟動前執行 alembic upgrade head（同雙容器版行為）
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
