# PR Docker Compose 檢查清單

> 發 PR merge 回 master 前，確認所有改動符合 docker-compose 部署需求。

## 檢查結果摘要

### 符合項目

| 項目 | 狀態 |
|------|------|
| `docker-compose.yml` 設定正確 | 通過 |
| `backend/.dockerignore` 排除 .env、*.db | 通過 |
| `backend/Dockerfile` 使用 Python 3.11、libpq-dev | 通過 |
| `backend/entrypoint.sh` 執行 alembic + uvicorn | 通過 |
| `frontend/Dockerfile` 多階段建置、VITE_API_URL 可覆寫 | 通過 |
| `frontend/nginx.conf` 正確 proxy /api/v1 至 backend | 通過 |
| `backend/app/core/config.py` 支援 USE_LOCAL_DB（舊 USE_QA_DATABASE_SECRET 仍 backwards-compat） | 通過 |
| `backend/app/core/secrets.py` 與 autotest-service 相容 | 通過 |
| `backend/alembic/env.py` 支援 remote DB 與 PostgreSQL | 通過 |
| Volumes `tcms_data`、`tcms_uploads` 正確掛載 | 通過 |
| Port 映射 19425→8000、8085→80 | 通過 |

### 已修正項目

| 項目 | 修正內容 |
|------|----------|
| `docker-compose.postgres.yml` | 補充 `USE_LOCAL_DB=true`，確保 PostgreSQL 模式使用 local DB |
| `version: '3.8'` | 已移除（Docker Compose v2+ 不再需要，避免 obsolete 警告） |
| `.gitignore` | 新增 `*.db`，避免 DB 檔案被 commit |

### 發 PR 前需手動處理

1. **移除已追蹤的 DB 檔案**（若已 commit）：
   ```bash
   cd kkday-qa-ai
   git rm --cached kk_tcms_1.5/backend/data.db kk_tcms_1.5/backend/tcms.db kk_tcms_1.5/backend/tcms_1_5.db 2>/dev/null || true
   git commit -m "chore: 從版控移除 DB 檔案"
   ```

2. **確認 `backend/.env` 未納入版控**：`.env` 已在 `.gitignore`，部署時使用 `cp backend/.env.example backend/.env` 後編輯。

3. **EC2 部署前**：依 `docs/EC2_DEPLOYMENT.md` 填寫 `SECRET_SERVICE_URL`、`AUTOMATION_TOKEN`。

## 驗證方式

```bash
cd kk_tcms_1.5

# 1. 驗證 docker-compose 設定
docker compose config

# 2. 建置並啟動（需先備妥 backend/.env）
docker compose up -d --build

# 3. 健康檢查
curl http://localhost:19425/api/v1/health

# 4. 使用 PostgreSQL override 測試
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```
