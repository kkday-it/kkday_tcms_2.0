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

### macOS

```bash
chmod +x setup_macos.sh
./setup_macos.sh   # 不需要 sudo
./start.sh
```

### Ubuntu

```bash
chmod +x setup_ubuntu.sh
sudo ./setup_ubuntu.sh
./start.sh
```

`setup_*.sh` 會自動：
- 安裝 Python 3.11 + 建立 `.venv` + 安裝 pip 套件
- 安裝 Node.js 20 + 執行 `npm install`
- 執行 Alembic migration
- 產生 `frontend/.env`（`VITE_API_URL=/api/v1`）

服務啟動後：
- Frontend → http://localhost:8085
- Backend API → http://localhost:19425
- API 文件 → http://localhost:19425/api/v1/docs

---

## Docker 啟動

```bash
docker compose up -d
```

與本機模式使用相同 Port（`8085` / `19425`）。

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
