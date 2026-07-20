# CLAUDE.md — KK TCMS 1.5 開發指引 (給 AI)

這是 KKday TCMS（Test Case Management System）。FastAPI (async) + React/Vite 的 mono
子專案，位於 `kkday-qa-ai/kk_tcms_1.5`。這份文件記錄「不看程式碼不會知道」的本地開發知識；
一般啟動步驟看 [`README.md`](./README.md)，DB 安全紅線看 [`.ai_rules.md`](./.ai_rules.md)。

## 服務 Port
| 服務 | Port |
|---|---|
| Backend (uvicorn) | `19425` |
| Frontend (Vite，proxy `/api` → 19425) | `8085` |

前端路由有 login guard（`App.tsx` 的 `ProtectedRoute` 只檢查 `localStorage.tcms_token` 是否存在）。

## DB 模式：這是重點，別搞錯

真正的資料在**遠端 SIT PostgreSQL**（`autotest-service.sit.kkday.com:5432/qa_automation`，
用受限帳號 `ai_worker`，只有 DML 權限）。本地 SQLite 只是選用的離線快照。

`backend/.env` 用兩個 flag 決定連哪裡（詳見 README 的優先順序表）：
- **連遠端 SIT（有真實資料，看真實畫面用這個）**：`USE_QA_DATABASE_SECRET=true`（或 `USE_LOCAL_DB=false`）
  + `SECRET_SERVICE_URL` + `AUTOMATION_TOKEN`（走 `get_secret("qa_database")` 拿連線）。
- **連本地 SQLite（離線 / 可重置）**：`USE_LOCAL_DB=true` + `DATABASE_URL=sqlite+aiosqlite:///tcms_1_5.db`。

> ⚠️ 讀取端點（`GET /runs/...`、`GET /results/run/...` 等）**不需要 auth**；只有 write
> 端點靠 `require_role` → `get_current_user`（Bearer token）。所以要「看畫面」時，把
> `.env` 指向 SIT 就能讀真實資料。若被 login guard 擋，只要在瀏覽器對 `localhost:8085`
> 塞 `localStorage.tcms_token`（登入用你的 SIT 帳號正常登入即可）。**只做 GET，別在共用
> SIT 上按編輯/儲存。**

## 本地 SQLite 快照與 `.db.bak`（`*.db.bak` 已 gitignore，勿 commit）

- 空的 SQLite **啟動時不會自動建表**（`main.py` lifespan 只做 health check + 少數欄位補丁，
  沒有 `create_all`）。schema 靠 alembic 或一次性 `Base.metadata.create_all`。
- 要把 SIT 資料拉成本地 SQLite：`backend/scripts/sync_remote_to_local.py`。它會：
  1. 先把現有 `tcms_1_5.db` 備份成 `tcms_1_5.db.bak` + `logs/backups/tcms_1_5_<ts>.db.bak`
  2. 從 SIT `SELECT * FROM <table>` → 本地 `DELETE`+`INSERT`。
  **它只 insert 不建表**，所以本地 `tcms_1_5.db` 必須先有「當前 schema」才能跑。
- 完整刷新本地快照流程：
  ```bash
  cd backend
  # 1) 建當前 schema 的空 sqlite（用 models create_all，或 alembic upgrade head 指向 sqlite）
  # 2) 從 SIT 拉資料 + 產生新 .bak
  PYTHONPATH=. python -m scripts.sync_remote_to_local
  ```
- **踩坑紀錄**：repo 曾 commit 一份 `tcms_1_5.db.bak`（15MB），是**舊 schema**（缺 `external_id`
  等後加欄位），直接拿來跑 `/runs/project/{id}` 會 500（`no such column`）。現已改為
  gitignore、需要時用上面 sync script 現拉，不再把 DB blob 放進 git。

## 測試

- Backend：`cd backend && pytest`（用 in-memory SQLite，見 `tests/conftest.py`）。
  - 打 write 端點的測試需要 `admin_auth` fixture（override `get_current_user` 回 in-memory Admin，
    繞過 Bearer token）。範本見 `tests/test_api_cases.py` / `tests/test_api_runs.py`。新增會寫入的
    測試模組時記得比照。
  - pytest 跑完偶爾會**卡在結束不 return**（背景 scheduler / async engine 沒收乾淨），這是
    既有現象、非測試失敗；本地可用 `timeout 90 pytest ...` 包起來看結果。
- Frontend：**沒有 unit test runner**（只有 Playwright e2e：`npm run test:e2e`）。型別把關用
  `npm run typecheck`（`tsc -b --noEmit`）。在 git worktree 裡跑需要 `node_modules`，可 symlink
  主 checkout 的：`ln -s <main>/frontend/node_modules <worktree>/frontend/node_modules`。

## Schema 變更
一律走 alembic（`backend/alembic/versions/`）。`ai_worker` 沒有 DDL 權限，migration 的
`alembic upgrade head` **由人在安全環境手動執行**，AI 只提出 migration script。細節見 `.ai_rules.md`。
