# KK TCMS 1.5

KKday 測試案例管理系統（Test Case Management System），提供 Test Case 建立與管理、Test Run 執行追蹤、Test Plan 規劃、Dashboard 統計，以及 AI 向量資料庫整合功能。

---

## 目錄

- [技術架構](#技術架構)
- [主要功能](#主要功能)
- [本機啟動](#本機啟動)
- [Docker 啟動](#docker-啟動)
- [Dify 知識庫整合](#dify-知識庫整合)
- [API 文件](#api-文件)
- [Unit Test](#unit-test)
- [CI 整合](#ci-整合)
- [PostgreSQL 遷移](#postgresql-遷移)
- [相關文件](#相關文件)

---

## 技術架構

| 層 | 技術 |
|---|---|
| Backend | Python 3.11 / FastAPI (async) / SQLAlchemy 2.x / Alembic / SQLite (dev) / PostgreSQL (prod) |
| Frontend | React 18 / TypeScript / Vite / Tailwind CSS v4 / Tiptap / dnd-kit / recharts |
| 容器化 | Docker / Docker Compose |
| AI 整合 | Dify Knowledge Base API / 向量資料庫 |
| 認證 | Google OAuth / 帳密登入 |

服務 Port：

| 情境 | Port |
|---|---|
| **Docker 單容器**（部署形態） | `8085`（前端 + API 同一 port） |
| 本機開發（雙 process） | Frontend `8085`(Vite) ／ Backend `19425`(uvicorn) |

---

## 主要功能

| 模組 | 說明 |
|---|---|
| **Repository** | Test Suite 樹狀管理、Test Case CRUD（含步驟、標籤、Priority）、history 紀錄 |
| **Test Runs** | Run 建立 / 複製 / 封存 / 還原；Folder 分組；bulk-copy 跨 Sprint；Result 逐筆更新 |
| **Test Plans** | Plan 建立 / Clone；關聯 Run；Cases 進度追蹤；Run Folder 連結 |
| **Dashboard** | 專案統計、近期 Run 清單、Run Type 分佈、個人 assigned runs |
| **Import** | XMind `.xmind` 一鍵匯入；Zephyr Scale XML 匯入 |
| **Export** | Test Cases CSV / JSON / AI JSON；Test Runs CSV / JSON；Test Plans JSON |
| **Backup / Restore** | 整個 Project 打包成 ZIP；還原時自動略過重複資料 |
| **Users** | 帳號管理、角色、密碼重設；Google OAuth 登入 |
| **Settings** | Dify 知識庫同步設定 |
| **Logs** | Frontend log（`/fe-log`）、Backend log（`/be-log`）公開端點 |

---

## 本機啟動

### 1. 啟動 Backend

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 19425
```

### 2. 啟動 Frontend

```bash
cd frontend
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

> 輔助腳本：`bash start.sh`（雙 process 開發，同上）／`bash start.single.sh`（單一 process，模擬整併後形態，前端 + API 同在 `:19425`）／`bash stop.sh` 停止。

---

## Docker 啟動

首次執行前建立 `backend/.env`：

```bash
cp backend/.env.example backend/.env
# .env.example 預設 USE_LOCAL_DB=true，本機 SQLite 直接可跑。
# 要改成 EC2 / docker prod 模式：USE_LOCAL_DB=false 並填 SECRET_SERVICE_URL、AUTOMATION_TOKEN。
```

> **DB 連線開關優先順序** (`USE_LOCAL_DB` vs 已棄用的 `USE_QA_DATABASE_SECRET`)：
>
> | `USE_LOCAL_DB` | 已棄用的 `USE_QA_DATABASE_SECRET` | 實際模式 |
> |---|---|---|
> | unset / `true` | unset | **local**(用 `DATABASE_URL`) |
> | `false` | unset | **remote**(走 `get_secret`) |
> | (任意值) | `true` | **remote**(舊名優先,印 `DeprecationWarning`) |
> | (任意值) | `false` | **local**(舊名優先,印 `DeprecationWarning`) |
>
> 兩者並存時舊名優先,reflect 既有部署現況;新環境請改用 `USE_LOCAL_DB`。
> backend 啟動 log 會印一次最終解析結果(`[Config] DB mode=...`)以利除錯。

```bash
docker compose up -d --build
```

**單一容器**：前端(Vite build)併入後端 image，由 FastAPI 一起 serve，對外只開一個 port `8085`（前端 + API 同源）。預設使用 remote DB（qa_database）。

> **EC2 子路徑部署（/tcms）**：`docker-compose.yml` 已將 `VITE_BASE_URL` 預設 `/tcms/`、`VITE_API_URL` 預設 `/tcms/api/v1`、`ROOT_PATH` 預設 `/tcms`，直接 build 即可。host nginx 只需一段 `location /tcms/`（見 [docs/deployment_nginx.md](docs/deployment_nginx.md)）。
>
> **本機直連 port 測試**（開 http://localhost:8085/）：
> ```bash
> VITE_API_URL=/api/v1 VITE_BASE_URL=/ ROOT_PATH= FRONTEND_BASE_URL=/ docker compose up -d --build
> ```

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
| Export for AI | 含 `text` + `metadata` 欄位，適合向量 DB ingestion |

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

主要端點概覽：

| 分類 | 方法 | 路徑 | 說明 |
|---|---|---|---|
| Health | `GET` | `/api/v1/health` | 健康檢查 |
| Cases | `GET/POST` | `/api/v1/cases/` | Test Case CRUD |
| Cases | `GET` | `/api/v1/cases/export` | 匯出（`format=csv\|json\|ai_json`） |
| Cases | `POST` | `/api/v1/cases/sync/dify` | 同步至 Dify |
| Suites | `GET/POST` | `/api/v1/suites/` | Test Suite CRUD（支援巢狀） |
| Runs | `GET/POST` | `/api/v1/runs/` | Test Run CRUD |
| Runs | `POST` | `/api/v1/runs/bulk-copy` | 批次複製 Runs（含 `$template` 標題替換） |
| Runs | `POST` | `/api/v1/runs/{id}/duplicate` | 複製單一 Run |
| Runs | `POST` | `/api/v1/runs/{id}/restore` | 還原封存 Run |
| Runs | `GET` | `/api/v1/runs/export` | 匯出 Run 結果（`format=csv\|json`） |
| Results | `GET/PUT` | `/api/v1/results/` | Test Result 逐筆更新 |
| Plans | `GET/POST` | `/api/v1/plans/` | Test Plan CRUD |
| Plans | `POST` | `/api/v1/plans/{id}/clone` | Clone 整個 Plan |
| Plans | `GET` | `/api/v1/plans/export` | 匯出 Plans（JSON） |
| Run Folders | `GET/POST` | `/api/v1/run-folders/` | Run Folder CRUD |
| Plan Folders | `GET/POST` | `/api/v1/plan-folders/` | Plan Folder CRUD |
| Dashboard | `GET` | `/api/v1/dashboard/stats` | 專案統計數字 |
| Dashboard | `GET` | `/api/v1/dashboard/summary` | 近期 Run、分佈圖、Top failing |
| Dashboard | `GET` | `/api/v1/dashboard/me` | 個人 assigned runs 統計 |
| Import | `POST` | `/api/v1/xmind/import` | XMind `.xmind` 匯入 |
| Import | `POST` | `/api/v1/zephyr/import` | Zephyr Scale XML 匯入 |
| Backup | `GET` | `/api/v1/backup` | 下載整個 Project ZIP 備份 |
| Backup | `POST` | `/api/v1/backup/restore` | 還原 ZIP 備份 |
| Users | `GET/POST` | `/api/v1/users/` | 使用者管理 |
| Auth | `POST` | `/api/v1/auth/google` | Google OAuth 登入 |

---

## Unit Test

測試位於 `backend/tests/`，使用 in-memory SQLite，不影響正式資料庫。

```
backend/
├── tests/
│   ├── conftest.py              # fixtures：測試 DB、HTTP client、project/suite 建立
│   ├── test_api_cases.py        # Health / Projects / Suites / Cases / Export / Dify
│   ├── test_api_runs.py         # Runs CRUD / Duplicate / Bulk Copy / Results / Folders
│   ├── test_api_plans.py        # Plans CRUD / Clone / Folders / Links / Cases / Runs
│   ├── test_api_dashboard.py    # Stats / Summary / Me
│   ├── test_api_export.py       # Cases / Runs / Plans 匯出格式
│   ├── test_api_backup.py       # Backup ZIP 結構 / Restore 冪等性
│   ├── test_api_users.py        # Users CRUD / Login / Password / Projects / Suites
│   ├── test_api_xmind_import.py # XMind 解析 / Priority / Steps / 匯入 API
│   └── test_safe_deletion.py    # Suite / Case cascade 安全刪除
└── pytest.ini                   # asyncio_mode = auto
```

### 執行測試

```bash
cd backend

# 啟動虛擬環境（若尚未啟動）
source .venv/bin/activate

# 執行所有測試
pytest tests/ -v

# 只跑特定模組
pytest tests/test_api_runs.py -v

# 只跑特定 class
pytest tests/test_api_runs.py::TestBulkCopyRuns -v
```

### 測試涵蓋範圍（227 tests）

| 模組 | Class | 測試數 | 說明 |
|---|---|---|---|
| `test_api_cases.py` | `TestHealthCheck` | 1 | API 健康檢查 |
| | `TestProjectsAPI` | 2 | 建立、列表 |
| | `TestSuitesAPI` | 3 | 建立、巢狀 Suite、列表 |
| | `TestCasesAPI` | 9 | CRUD、history、labels |
| | `TestExportAPI` | 5 | CSV / JSON / AI JSON / suite filter / 錯誤格式 |
| | `TestDifySyncStatus` | 3 | 未設定狀態、缺少參數、觸發 sync |
| `test_api_runs.py` | `TestRunsCRUD` | 10 | CRUD、stats、cases |
| | `TestRunDuplicate` | 2 | 複製 Run |
| | `TestBulkCopyRuns` | 14 | `$template` 替換、跨 Sprint、input validation |
| | `TestResultsAPI` | 6 | Result 更新、stats 反映 |
| | `TestRunFoldersAPI` | 4 | Folder CRUD |
| `test_api_plans.py` | `TestPlansCRUD` | 9 | CRUD |
| | `TestPlanClone` | 7 | Clone Plan |
| | `TestPlanFoldersAPI` | 5 | Plan Folder CRUD |
| | `TestPlanLinks` | 4 | Run 關聯 |
| | `TestPlanRunsSummary` | 4 | Runs 進度統計 |
| | `TestPlanCasesData` | 3 | Cases 資料 |
| | `TestActorId` | 3 | actor_id 邏輯 |
| `test_api_dashboard.py` | `TestDashboardStats` | 4 | 統計數字欄位 |
| | `TestDashboardSummary` | 7 | 近期 Runs / 分佈 / Top failing |
| | `TestDashboardMe` | 5 | 個人統計 |
| `test_api_export.py` | `TestCasesExport` | 10 | Cases CSV / JSON / AI JSON |
| | `TestRunsExport` | 9 | Runs CSV / JSON / 單 Run filter |
| | `TestPlansExport` | 8 | Plans JSON 結構 |
| `test_api_backup.py` | `TestBackupAPI` | 14 | ZIP 結構 / 各 JSON 格式驗證 |
| | `TestRestoreAPI` | 10 | Restore 冪等性 / 資料完整性 |
| `test_api_users.py` | `TestUsersCRUD` | 10 | 使用者 CRUD |
| | `TestUsersLogin` | 4 | 登入 / 認證 |
| | `TestUsersPassword` | 3 | 密碼重設 |
| | `TestProjectsCompleteCRUD` | 4 | Projects 完整 CRUD |
| | `TestSuitesCompleteCRUD` | 4 | Suites 完整 CRUD |
| `test_api_xmind_import.py` | `TestXmindImportAPI` | 15 | 匯入 API 完整流程 |
| | `TestParsePriority` | 7 | Priority 解析邏輯 |
| | `TestParseSteps` | 6 | Steps 解析邏輯 |
| | `TestParseTestCaseData` | 5 | Case 資料解析 |
| | `TestHasValidTestCases` | 5 | 有效 Case 判斷 |
| `test_safe_deletion.py` | `TestSafeDeletion` | 3 | Suite / Case cascade 刪除 |

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

App container（單容器）啟動時 `entrypoint.sh` 會自動執行：

```bash
alembic upgrade head   # 建立所有資料表（全新 DB）或套用 migration（已有資料）
```

也可手動執行：

```bash
docker compose exec app alembic upgrade head
```

#### 步驟三：搬移現有 SQLite 資料

```bash
# 在 app container 內執行（或本機安裝 psycopg2 後執行）
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

重啟 app：

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml restart app
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
  working-directory: backend
  run: |
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pytest tests/ -v
```

或 shell 版本：

```bash
cd backend
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
| [docs/DATABASE_RECOVERY_AND_BACKUP.md](docs/DATABASE_RECOVERY_AND_BACKUP.md) | 資料庫備份與還原操作指引 |
| [docs/SAFE_DELETION_GUIDE.md](docs/SAFE_DELETION_GUIDE.md) | Suite / Case 安全刪除指引 |
| [docs/VERIFICATION_GUIDE.md](docs/VERIFICATION_GUIDE.md) | 部署後驗證清單 |
