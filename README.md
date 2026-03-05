# KK TCMS 1.5

KKday 測試案例管理系統（Test Case Management System），提供 Test Case 的建立、管理、執行追蹤，以及 AI 向量資料庫整合功能。

---

## 目錄

- [技術架構](#技術架構)
- [本機啟動](#本機啟動)
- [Docker 啟動](#docker-啟動)
- [Dify 知識庫整合](#dify-知識庫整合)
- [API 文件](#api-文件)
- [Unit Test](#unit-test)
- [CI 整合](#ci-整合)
- [相關文件](#相關文件)

---

## 技術架構

| 層 | 技術 |
|---|---|
| Backend | Python 3.11 / FastAPI / SQLAlchemy (async) / SQLite |
| Frontend | React 18 / TypeScript / Vite / TailwindCSS |
| 容器化 | Docker / Docker Compose |
| AI 整合 | Dify Knowledge Base API / 向量資料庫 |

服務 Port（本機與 Docker 一致）：

| 服務 | Port |
|---|---|
| Backend API | `19425` |
| Frontend | `8085` |

---

## 本機啟動

### 1. 啟動 Backend

```bash
cd kk_tcms_1.5/backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 19425
```

### 2. 啟動 Frontend

```bash
cd kk_tcms_1.5/frontend
npm install
npm run dev
```

Vite 啟動後已設定 proxy：`/api` → `http://localhost:19425`，不需要額外設定。

服務啟動後：
- Frontend → http://localhost:8085
- Backend API → http://localhost:19425
- API 文件 → http://localhost:19425/api/v1/docs
- FE Log（公開）→ http://localhost:8085/fe-log
- BE Log（公開）→ http://localhost:8085/be-log

---

## Docker 啟動

首次執行前建立 `backend/.env`：

```bash
cp backend/.env.example backend/.env
# 編輯填入 SECRET_SERVICE_URL、AUTOMATION_TOKEN（EC2 用 remote DB）
# 本機開發可改 USE_QA_DATABASE_SECRET=false 並設定 DATABASE_URL
```

```bash
docker compose up -d
```

與本機模式使用相同 Port（`8085` / `19425`）。預設使用 remote DB（qa_database）。

> **EC2 子路徑部署**：`docker-compose.yml` 已將 `VITE_BASE_URL` 預設為 `/tcms/`，`VITE_API_URL` 預設為 `/tcms/api/v1`，直接 build 即可，**不需要額外設定 `.env`**。

---

## Dify 知識庫整合

TCMS 支援將 Test Case 匯出或同步至 [Dify](https://dify.ai) Knowledge Base，讓 LLM workflow 可對測試資料進行語意搜尋。

### 設定

在 `backend/.env` 加入以下設定：

```bash
DIFY_BASE_URL=https://your-dify.example.com
DIFY_API_KEY=dataset-xxxxxxxxxxxxxxxx
DIFY_DATASET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Export 格式

在 Repository 頁面的 **Export** 下拉選單可選擇：

| 格式 | 說明 |
|---|---|
| Export CSV | 適合 Excel 開啟 |
| Export JSON | 完整結構化資料，適合系統整合 |
| 🤖 Export for AI | 含 `text` + `metadata` 欄位，適合向量 DB ingestion |

### 同步至 Dify

點擊 Repository 頁面的 **Sync to Dify** 按鈕，或直接呼叫 API：

```bash
# 同步整個 Project
POST /api/v1/cases/sync/dify?project_id=1

# 只同步指定 Suite（含子 Suite）
POST /api/v1/cases/sync/dify?suite_id=3

# 查看同步狀態
GET /api/v1/cases/sync/dify/status
```

同步後 TCMS 會在 `backend/data/dify_sync_map.json` 記錄 `case_id → document_id` 對應，再次同步時自動 update 而非重複建立。

---

## API 文件

Backend 啟動後，可透過以下路徑查看完整 Swagger 文件：

```
http://localhost:19425/api/v1/docs
```

主要端點：

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/api/v1/health` | 健康檢查 |
| `GET` | `/api/v1/cases/export` | 匯出 Test Cases（`format=csv\|json\|ai_json`） |
| `POST` | `/api/v1/cases/sync/dify` | 同步至 Dify Knowledge Base |
| `GET` | `/api/v1/cases/sync/dify/status` | 查看 Dify 同步狀態 |

---

## Unit Test

測試位於 `backend/tests/`，使用 in-memory SQLite，不影響正式資料庫。

```
backend/
├── tests/
│   ├── conftest.py        # fixtures：測試 DB、HTTP client、project/suite 建立
│   └── test_api_cases.py  # 23 個測試（health / projects / suites / cases / export / dify）
└── pytest.ini             # asyncio_mode = auto
```

### 執行測試

```bash
cd backend

# 啟動虛擬環境（若尚未啟動）
source .venv/bin/activate

# 執行所有測試
pytest tests/ -v
```

### 測試涵蓋範圍

| 群組 | 測試數 | 說明 |
|---|---|---|
| `TestHealthCheck` | 1 | API 健康檢查 |
| `TestProjectsAPI` | 2 | 建立、列表 |
| `TestSuitesAPI` | 3 | 建立、巢狀 Suite、列表 |
| `TestCasesAPI` | 8 | CRUD、history、labels |
| `TestExportAPI` | 5 | CSV / JSON / AI JSON / suite filter / 錯誤格式 |
| `TestDifySyncStatus` | 3 | 未設定狀態、缺少參數、未設定時觸發 sync |

---

## PostgreSQL 遷移

目前系統預設使用 SQLite（`backend/data/tcms_1_5.db`），中長期計畫遷移至 PostgreSQL container on EC2。

### 架構路徑

```
現在                      中期                     長期
SQLite file（本機）  →  Docker Compose on EC2  →  PostgreSQL container on EC2
```

### 遷移步驟

#### 步驟一：啟動 PostgreSQL（EC2 上執行）

```bash
# 在專案根目錄建立 .env（供 docker-compose.postgres 變數替換使用）
# 設定 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
# 詳見 docs/migration_sqlite_to_postgresql.md

# 用 PostgreSQL override 啟動
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d db
```

#### 步驟二：建立 Schema（Alembic 自動執行）

Backend container 啟動時 `entrypoint.sh` 會自動執行：

```bash
alembic upgrade head   # 建立所有資料表（全新 DB）或套用 migration（已有資料）
```

也可手動執行：

```bash
docker compose exec backend alembic upgrade head
```

#### 步驟三：搬移現有 SQLite 資料

```bash
# 在 backend container 內執行（或本機安裝 psycopg2 後執行）
python scripts/migrate_sqlite_to_pg.py \
    --sqlite ./data/tcms_1_5.db \
    --pg     postgresql://tcms:password@localhost:5432/tcms
```

腳本特性：
- 依資料表相依順序搬移（共 15 張表）
- 先清空再插入（可重複執行）
- 自動重置 PostgreSQL sequences
- 5000 筆 case 約 10~30 秒完成

#### 步驟四：切換 backend 連線

確認資料正確後，更新 `.env`：

```bash
DATABASE_URL=postgresql+asyncpg://tcms:password@db:5432/tcms
```

重啟 backend：

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml restart backend
```

### 現有 SQLite 部署的注意事項

如果你的 SQLite 資料庫已有資料且是透過 `create_all` 建立（非從 Alembic migration 建立），
需要執行一次 stamp 讓 Alembic 知道目前資料庫已是最新狀態：

```bash
cd backend
alembic stamp 43b3c73328ee
```

### 環境變數對照

| 情境 | DATABASE_URL |
|---|---|
| 本機 SQLite | `sqlite+aiosqlite:///./data/tcms_1_5.db` |
| Docker SQLite | `sqlite+aiosqlite:////app/data/tcms_1_5.db` |
| PostgreSQL | `postgresql+asyncpg://tcms:password@db:5432/tcms` |

---

## CI 整合

在 CI pipeline 的 Backend 測試步驟加入：

```yaml
# GitHub Actions 範例
- name: Run backend unit tests
  working-directory: kk_tcms_1.5/backend
  run: |
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pytest tests/ -v
```

或 shell 版本：

```bash
cd kk_tcms_1.5/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -v
```

---

## 相關文件

| 文件 | 說明 |
|------|------|
| [docs/EC2_DEPLOYMENT.md](docs/EC2_DEPLOYMENT.md) | EC2 部署檢查清單 |
| [docs/deployment_nginx.md](docs/deployment_nginx.md) | Nginx 反向代理設定（掛於 /tcms 路徑） |
| [docs/migration_sqlite_to_postgresql.md](docs/migration_sqlite_to_postgresql.md) | SQLite → PostgreSQL 遷移步驟 |
| [docs/test_case_management_strategy.md](docs/test_case_management_strategy.md) | Test Case 分類與 Test Run 執行策略 |
| [docs/PR_DOCKER_COMPOSE_CHECKLIST.md](docs/PR_DOCKER_COMPOSE_CHECKLIST.md) | PR 前 Docker Compose 相容性檢查 |
