# Database Migration Guide (Alembic)

為了確保 SIT 與 Production 環境的資料庫結構與程式碼同步，建議統一使用 **Alembic** 進行資料庫遷移，而不是手動執行 SQL。

## 1. 核心流程 (Development Workflow)

當您修改了 `app/models/` 下的 SQLAlchemy 模型時，請遵循以下步驟：

### 步驟 A：自動產生遷移腳本
在 `backend` 目錄下執行指令，Alembic 會比對 Model 與目前的 DB 結構，自動產生遷移檔案：
```bash
export PYTHONPATH=$PYTHONPATH:.
alembic revision --autogenerate -m "描述您的改動 (例如: add_status_to_test_steps)"
```
*這會在 `alembic/versions/` 下產生一個新的 `.py` 檔案。*

### 步驟 B：檢查產出的腳本
手動檢查新產生的檔案，確保 `upgrade()` 與 `downgrade()` 邏輯正確。

### 步驟 C：本地驗證
先在開發環境套用變更：
```bash
alembic upgrade head
```

---

## 2. SIT/Production 環境更新

在遠端環境執行時，建議使用具備 `ALTER` 權限的帳號（已設定於 `alembic.ini` 中的 `admin`）。

### 執行遷移指令
連線至 EC2 後，在 backend container 內執行：
```bash
# 讓資料庫更新至最新版本
alembic upgrade head
```

## 3. 安全與 AI 防護機制 (AI Safety & Human-in-the-Loop)

為了防止 AI 或自動化工具「亂改」資料庫，這套流程設計了兩層防護：

### 防護第一層：帳號權限隔離 (Principle of Least Privilege)
*   **`ai_worker` (AI 運行帳號)**：這是後端程式平常使用的帳號。它**絕對不具備** `ALTER`, `DROP`, `CREATE` 等結構異動權限。即便程式碼被惡意修改，它也無法破壞資料庫結構。
*   **`admin` (遷移帳號)**：僅用於執行 Alembic 遷移。這個密碼**不應**存在於 AI 能夠直接存取的自動化環境變數中（建議僅存在於 EC2 的環境變數或 Jenkins Secret 中）。

### 防護第二層：人為審核流程 (Human-Approved Migration)
1.  **AI 產生建議**：AI 修改模型並透過命令列產生遷移腳本 (`alembic/versions/*.py`)。
2.  **人類核對**：開發者 (您) 在 Git Commit 之前，必須**手動檢查**該腳本內容。這就像是改動資料庫結構的「PR」。
3.  **手動執行**：只有在人類確認腳本無誤後，才手動連線至 EC2 執行 `alembic upgrade head`。

> [!TIP]
> **最佳實務**：請將 `alembic.ini` 中的 `sqlalchemy.url` 改為從環境變數讀取，而不是寫死密碼。這樣可以確保 AI 在開發環境產出腳本時，完全碰不到遠端的 `admin` 帳號。

## 4. 安全檢查清單 (Security Checklist)

在執行任何遷移之前，請務必勾選以下檢查項：

- [ ] **腳本審視**：手動打開 `alembic/versions/` 下的新腳本，確認沒有意外的 `DROP` 或 `TRUNCATE` 指令。
- [ ] **環境確認**：確認目前的 `DATABASE_URL` 指向正確的環境（SIT vs Prod）。
- [ ] **權限控制**：確認 `admin` 憑證僅在執行遷移時透過環境變數提供，不應長期存在於 AI 可讀取的設定檔中。
- [ ] **備份**：對於涉及大量數據轉換的改動，請先執行 `db_backup.sh`。

## 5. 總結

這套流程的核心是：**AI 建議結構變更並產生腳本，而人類負責最後的審查與執行。** 這樣既能享受自動化產出腳本的便利，又能保有對資料庫安全的絕對控制。
