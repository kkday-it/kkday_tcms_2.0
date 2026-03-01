# SQLite → PostgreSQL 遷移手冊

**文件版本**：v1.0  
**建立日期**：2026-03-01  
**適用環境**：kk_tcms_1.5  
**目標環境**：EC2 + Docker Compose + PostgreSQL 16

---

## 目錄

1. [前置確認](#1-前置確認)
2. [EC2 環境準備](#2-ec2-環境準備)
3. [PostgreSQL container 啟動](#3-postgresql-container-啟動)
4. [Schema 建立（Alembic）](#4-schema-建立alembic)
5. [資料搬移](#5-資料搬移)
6. [切換 Backend 連線](#6-切換-backend-連線)
7. [驗收確認清單](#7-驗收確認清單)
8. [Rollback 方式](#8-rollback-方式)
9. [後續 Schema 變更流程](#9-後續-schema-變更流程)
10. [常見問題](#10-常見問題)

---

## 1. 前置確認

遷移前請確認以下項目皆已完成：

- [ ] EC2 instance 已啟動（建議 t3.small 以上）
- [ ] Docker & Docker Compose 已安裝（`docker compose version` 可執行）
- [ ] 專案已 `git pull` 至最新版本（`tcms_1.5` branch）
- [ ] SQLite 資料庫檔案已備份：

```bash
cp backend/data/tcms_1_5.db backend/data/tcms_1_5.db.bak_$(date +%Y%m%d)
```

- [ ] 服務維護時間已通知相關人員（資料搬移期間需短暫停機）

---

## 2. EC2 環境準備

### 安裝 Docker

```bash
# Ubuntu 22.04
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### 確認版本

```bash
docker --version          # Docker 24.x+
docker compose version    # Docker Compose v2.x+
```

### 防火牆設定（Security Group）

| Port | 說明 | 開放對象 |
|---|---|---|
| `8085` | Frontend | 0.0.0.0/0（或 Nginx 反向代理） |
| `19425` | Backend API | 0.0.0.0/0（或 Nginx 反向代理） |
| `5432` | PostgreSQL | **僅 EC2 內部，不對外開放** |

---

## 3. PostgreSQL Container 啟動

### 建立環境變數檔案

```bash
cd kk_tcms_1.5

cat > .env << 'EOF'
POSTGRES_USER=tcms
POSTGRES_PASSWORD=<自訂強密碼>
POSTGRES_DB=tcms
EOF
```

> ⚠️ `.env` 已加入 `.gitignore`，不會被 commit，請妥善保管密碼。

### 啟動 PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d db
```

### 確認 PostgreSQL 健康狀態

```bash
docker compose logs db | tail -20
docker compose exec db pg_isready -U tcms
# 應輸出：/var/run/postgresql:5432 - accepting connections
```

---

## 4. Schema 建立（Alembic）

### 方式 A：透過 Backend Container（推薦）

Backend container 啟動時 `entrypoint.sh` 會自動執行 `alembic upgrade head`：

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d backend
docker compose logs backend | grep -E "alembic|INFO|ERROR"
```

### 方式 B：手動執行

```bash
# 在 backend container 內執行
docker compose exec backend alembic upgrade head

# 或在本機（需已安裝 psycopg2-binary）
cd backend
DATABASE_URL=postgresql+asyncpg://tcms:<password>@localhost:5432/tcms \
    alembic upgrade head
```

### 確認資料表已建立

```bash
docker compose exec db psql -U tcms -d tcms -c "\dt"
```

應顯示 15 張資料表：

```
 users, projects, test_suites, test_cases, test_steps,
 test_cases_history, test_run_folders, test_run_assignees,
 test_runs, test_results, test_step_results,
 test_plans, test_plan_folders, plan_runs, plan_cases
```

---

## 5. 資料搬移

> ⚠️ 執行前請先停止 Backend，避免搬移期間有新資料寫入。

```bash
# 停止 backend
docker compose stop backend
```

### 執行搬移腳本

```bash
# 在 backend container 內執行
docker compose run --rm backend python scripts/migrate_sqlite_to_pg.py \
    --sqlite /app/data/tcms_1_5.db \
    --pg     postgresql://tcms:<password>@db:5432/tcms
```

**或在本機執行（需安裝 psycopg2-binary）：**

```bash
cd backend
source .venv/bin/activate
python scripts/migrate_sqlite_to_pg.py \
    --sqlite ./data/tcms_1_5.db \
    --pg     postgresql://tcms:<password>@localhost:5432/tcms
```

### 預期輸出

```
[10:30:01] 連線 SQLite: sqlite:///./data/tcms_1_5.db
[10:30:01] 連線 PostgreSQL: postgresql://tcms:***@localhost:5432/tcms
[10:30:01] 開始搬移資料...

  ✅  users: 12 筆
  ✅  projects: 3 筆
  ✅  test_suites: 48 筆
  ✅  test_cases: 5000 筆
  ✅  test_steps: 23400 筆
  ...

[10:30:25] ✅ 資料搬移完成！
```

### 驗證資料筆數

```bash
# SQLite 筆數
sqlite3 backend/data/tcms_1_5.db "SELECT 'test_cases', COUNT(*) FROM test_cases;"

# PostgreSQL 筆數
docker compose exec db psql -U tcms -d tcms \
    -c "SELECT 'test_cases', COUNT(*) FROM test_cases;"
```

兩邊筆數應一致。

---

## 6. 切換 Backend 連線

確認資料正確後，修改 `.env` 加入 Database URL：

```bash
# 在 .env 加入（或修改）
echo "DATABASE_URL=postgresql+asyncpg://tcms:<password>@db:5432/tcms" >> .env
```

重新啟動所有服務：

```bash
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

確認 Backend 連線 PostgreSQL：

```bash
docker compose logs backend | grep -E "Database|alembic|Error"
curl http://localhost:19425/api/v1/health
# 應輸出：{"status": "ok", "project": "KK TCMS 1.5 API"}
```

---

## 7. 驗收確認清單

完成遷移後請依序確認：

- [ ] `GET /api/v1/health` 回傳 `{"status": "ok"}`
- [ ] 前端 http://localhost:8085 可正常登入
- [ ] 專案列表可正常顯示
- [ ] Test Case 列表資料完整（筆數與 SQLite 一致）
- [ ] 新增 Test Case 功能正常
- [ ] 刪除 Test Case 功能正常（含 history cascade）
- [ ] Export CSV / JSON 功能正常
- [ ] Test Run 列表可正常顯示

---

## 8. Rollback 方式

若遷移後發現問題，可快速切回 SQLite：

### 1. 停止服務

```bash
docker compose down
```

### 2. 移除 `DATABASE_URL` 設定

```bash
# 編輯 .env，移除或註解 DATABASE_URL 那行
# DATABASE_URL=postgresql+asyncpg://...
```

### 3. 用原本的 docker-compose 重啟

```bash
docker compose up -d
```

Backend 會自動使用預設的 SQLite URL（`sqlite+aiosqlite:////app/data/tcms_1_5.db`）。

---

## 9. 後續 Schema 變更流程

遷移完成後，新增欄位或資料表需走 **Alembic migration**，不要直接改資料庫。

### 新增欄位範例

```bash
# 1. 修改 SQLAlchemy model
# backend/app/models/xxx.py

# 2. 生成 migration 腳本
cd backend
DATABASE_URL=postgresql+asyncpg://tcms:<password>@localhost:5432/tcms \
    alembic revision --autogenerate -m "add xxx column to yyy"

# 3. 確認生成的 migration 內容正確
cat alembic/versions/<new_revision>.py

# 4. 套用 migration
alembic upgrade head

# 5. Commit 並推上 remote
git add alembic/versions/<new_revision>.py
git commit -m "migration: add xxx column to yyy"
```

### 修改設定檔位置對照

| 需求 | 修改位置 |
|---|---|
| 資料庫連線 | EC2 上的 `.env` → `DATABASE_URL` |
| PostgreSQL 帳密 | EC2 上的 `.env` → `POSTGRES_USER / PASSWORD / DB` |
| Dify 整合設定 | EC2 上的 `.env` → `DIFY_BASE_URL / API_KEY / DATASET_ID` |
| Backend Port | `docker-compose.yml` → `backend.ports` |
| Frontend Port | `docker-compose.yml` → `frontend.ports` |
| Nginx 反向代理 | 參考 `docs/deployment_nginx.md` |
| Python 套件新增 | `backend/requirements.txt` + 重新 build image |
| Frontend npm 套件 | `frontend/package.json` + 重新 build image |

---

## 10. 常見問題

**Q: `alembic upgrade head` 報錯 `relation "xxx" already exists`**

A: 資料表已存在。migration 使用 `if not exists` 保護，理論上不會發生。若仍出現，執行：

```bash
alembic stamp 43b3c73328ee  # 標記為最新版，不重跑 migration
```

---

**Q: 搬移後 PostgreSQL 的 ID sequence 沒有跟上，新增資料報 duplicate key**

A: 搬移腳本會自動重置 sequence，若仍發生：

```sql
-- 手動重置（在 psql 內執行）
SELECT setval(pg_get_serial_sequence('test_cases', 'id'), MAX(id)) FROM test_cases;
-- 對每張有 id 欄位的資料表執行
```

---

**Q: Backend 連不到 PostgreSQL（`Connection refused`）**

A: 確認：
1. PostgreSQL container 是否 healthy：`docker compose ps`
2. `DATABASE_URL` 中的 host 是否為 `db`（container service name），非 `localhost`
3. `.env` 的密碼與 `POSTGRES_PASSWORD` 是否一致

---

**Q: 現有 SQLite 部署升級時 Alembic 報錯**

A: 舊部署的 `alembic_version` 可能是空的或對不上。執行：

```bash
# 標記目前 DB 狀態為最新 migration
alembic stamp 43b3c73328ee
```

---

> **文件維護**：每次新增 Alembic migration 後，請同步更新「後續 Schema 變更流程」章節。
