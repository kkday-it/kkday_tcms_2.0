# PR: tcms_1.5 → master

## 標題

```
feat(tcms): KK TCMS 1.5 - 測試案例管理系統
```

---

## 說明

### 概述

本次 PR 將 **KK TCMS 1.5**（KKday 測試案例管理系統）合併回 master，為獨立可部署的 Test Case Management System，提供 Test Case 建立、管理、執行追蹤，以及 Dify 知識庫整合。

### 主要功能

- **Test Case 管理**：Project / Suite / Case CRUD、歷史版本、標籤
- **Test Plan / Test Run**：測試計劃、執行紀錄、結果追蹤
- **匯出與同步**：CSV / JSON / AI JSON 匯出，Dify Knowledge Base 同步
- **Zephyr / XMind 匯入**：自 Jira Zephyr 或 XMind 匯入 Test Cases

### 技術棧

| 層 | 技術 |
|---|---|
| Backend | Python 3.11 / FastAPI / SQLAlchemy (async) |
| Frontend | React 18 / TypeScript / Vite / TailwindCSS |
| 容器化 | Docker / Docker Compose |
| 資料庫 | SQLite（預設） / PostgreSQL（可選）/ Remote qa_database |

### 變更範圍

- 新增 `kk_tcms_1.5/` 完整專案
- Docker Compose 部署支援（含 PostgreSQL override）
- 依 `get_secret` 取得 qa_database 連線（與 QA-automation 相容）
- `.gitignore` 新增 `*.db`，避免 DB 檔案納入版控

---

## 部署指引

### 前置需求

- Docker & Docker Compose
- `backend/.env`：依 `backend/.env.example` 建立，填入 `SECRET_SERVICE_URL`、`AUTOMATION_TOKEN`

### 啟動步驟

```bash
cd kk_tcms_1.5
cp backend/.env.example backend/.env
# 編輯 backend/.env 填入 SECRET_SERVICE_URL、AUTOMATION_TOKEN

docker compose up -d
```

- Frontend: http://localhost:8085
- Backend API: http://localhost:19425
- API 文件: http://localhost:19425/api/v1/docs

### 文件索引

| 文件 | 說明 |
|------|------|
| [README.md](../README.md) | 專案總覽、本機 / Docker 啟動、Unit Test |
| [EC2_DEPLOYMENT.md](./EC2_DEPLOYMENT.md) | EC2 部署檢查清單 |
| [deployment_nginx.md](./deployment_nginx.md) | Nginx 反向代理設定 |
| [migration_sqlite_to_postgresql.md](./migration_sqlite_to_postgresql.md) | SQLite → PostgreSQL 遷移 |
| [test_case_management_strategy.md](./test_case_management_strategy.md) | Test Case 分類與 Test Run 策略 |
| [PR_DOCKER_COMPOSE_CHECKLIST.md](./PR_DOCKER_COMPOSE_CHECKLIST.md) | Docker Compose 相容性檢查 |

---

## 測試

```bash
cd kk_tcms_1.5/backend
source .venv/bin/activate
pytest tests/ -v
```

---

## Checklist

- [x] Docker Compose 設定已驗證
- [x] `.env.example` 存在，`.env` 已列入 .gitignore
- [x] `*.db` 已列入 .gitignore
- [x] 相關文件已備齊並可被索引
- [ ] CI 已通過（若有）
- [ ] 已移除已追蹤的 DB 檔案（若存在）：`git rm --cached kk_tcms_1.5/backend/*.db`
