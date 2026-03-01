FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/data /app/uploads

COPY . .

# 啟動前執行 alembic upgrade head：
#   - 全新 PostgreSQL → 依序建立所有資料表
#   - 已有資料的 DB  → 套用尚未執行的 migration，無則跳過
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
