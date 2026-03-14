# 資料庫修復與備份機制總結 (QA-TCMS 1.5)

本文檔記錄了維護 `qa_automation` 資料庫完整性、相容性及安全性的「最穩健且適中」實作方案。

## 1. 資料庫結構修復 (已完成)

為了在遷移至 `tcms_` 前綴資料表的同時，確保舊有自動化服務與程式碼不壞掉，我們採取了以下措施：

### 1.1 核心資料表：相容性視圖 (Views)
- **數量**：共 15 個。
- **對象**：`users`, `projects`, `test_cases`, `test_suites`, `test_plans`, `test_runs` 等。
- **邏輯**：建立與舊表同名的 PostgreSQL View，直接指向新表（例如：`users` -> `tcms_users`）。
- **優點**：
  - **100% 向後相容**：舊程式不需修改即可存取資料。
  - **資料一致性**：新舊名稱共用同一份底層資料，無同步問題。

### 1.2 自動化資料表：結構重建 (Tables)
- **數量**：共 13 個。
- **對象**：`automation_auth`, `automation_test_case`, `chat_sessions` 等。
- **邏輯**：因為這些表之前被徹底刪除且無替代新表，所以根據歷史紀錄重建了實體表。
- **提醒**：此部分資料為空，需手動補入（如 Token 資訊）。

---

## 2. 備份與還原機制 (現行方案)

為了防止未來再次發生資料遺失，我們建立了一套「每日自動循環」的備份系統。

### 2.1 備份策略
- **頻率**：**每日凌晨 03:00** 執行一次全量備份。
- **方式**：使用 `pg_dump` 匯出並配合 `gzip` 壓縮。
- **保留規則**：**保留最近 7 天 (Retention: 7 Days)**。
  - *考量*：一週內的故障通常能及時發現，保留 7 天在「硬碟空間」與「復原靈活性」之間取得了最佳平衡。

### 2.2 儲存路徑 (外部同步)
利用 Docker Volume 掛載機制，確保資料保存在宿主機：
- **宿主機位置**：`/data/docker-postgres/data/backups/`
- **容器位置**：`/var/lib/postgresql/data/backups/`

### 2.3 腳本位置
- **備份腳本**：`/data/docker-postgres/scripts/db_backup.sh`
- **還原腳本**：`/data/docker-postgres/scripts/db_restore.sh`

---

## 3. 操作手冊

### 3.1 手動備份
```bash
/bin/bash /data/docker-postgres/scripts/db_backup.sh
```

### 3.2 執行還原
```bash
# 需輸入備份檔名，系統會進行二次確認
/bin/bash /data/docker-postgres/scripts/db_restore.sh [備份檔名].sql.gz
```

### 3.3 設定自動排程 (Cron Job)
在伺服器執行 `crontab -e` 並加入：
```bash
0 3 * * * /bin/bash /data/docker-postgres/scripts/db_backup.sh >> /data/docker-postgres/data/backups/backup.log 2>&1
```

---

## 4. 歷史帳密提示 (get_secret)
若需追查歷史帳密，系統主要使用以下 Key：
- `production_atlassian`: Jira/Confluence API (Terry's Token)
- `qa_database`: 資料庫連線資訊
- `zephyr_token_key`: Zephyr 測試管理 Token
- `ai_keys`: AI 相關服務 API 密鑰
