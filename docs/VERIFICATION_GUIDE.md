# 驗證指南：資料完整性與服務不中斷檢查

為了確保在執行「系統解耦 (Decouple)」或「還原 (Restore)」過程中資料 100% 安全且服務持續運作，請遵循以下驗證流程。

---

## 1. 執行前：資料快照與備份驗證 (Pre-Check)

在執行任何 SQL 改動前，請先記錄目前的「基準數據」：

### 1.1 執行備份
```bash
/bin/bash /data/docker-postgres/scripts/db_backup.sh
```
確認備份目錄 `/data/docker-postgres/data/backups/` 是否有新檔案產出，且檔案大小不為 0。

### 1.2 記錄關鍵資料量
請執行以下 SQL 並存檔結果，作為之後的比對基準：
```sql
SELECT 'tcms_test_cases' as name, count(*) FROM tcms_test_cases
UNION ALL
SELECT 'tcms_users', count(*) FROM tcms_users
UNION ALL
SELECT 'automation_test_case', count(*) FROM automation_test_case;
```

### 1.3 記錄 View / Table 狀態（供 3.1 比對）
執行以下 SQL 並存檔，用來確認解耦後「捷徑」已變為實體表：
```sql
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('test_cases', 'users', 'tcms_test_cases', 'tcms_users')
ORDER BY table_name;
```
解耦前：`test_cases`、`users` 的 `table_type` 應為 `VIEW`。解耦後（見 3.1）應變為 `BASE TABLE`。

---

## 2. 執行中：服務監控 (Monitoring)

執行解耦腳本時（腳本名稱與路徑依實際部署為準，可參考 [LEGACY_DECOUPLING_PROPOSAL.md](LEGACY_DECOUPLING_PROPOSAL.md)），請開啟另一個視窗監控服務狀態：

### 2.1 監控容器狀態
```bash
docker ps
```
確保 `tcms_backend` 與資料庫容器維持 `Up` 狀態。

### 2.2 監控後端日誌
```bash
docker logs -f tcms_backend --tail 50
```
檢查是否有出現 `connection error` 或 `relation does not exist` 的新的報錯。

---

## 3. 執行後：資料一致性驗證 (Post-Check)

執行完解耦腳本後，確認「捷徑」已成功轉為「獨立實體表」：

### 3.1 驗證表結構轉型
再次執行 **1.3** 的 SQL（查詢 `information_schema.tables`），確認 `test_cases`、`users` 的 `table_type` 已從 `VIEW` 變為 `BASE TABLE`。

### 3.2 驗證資料影印是否完全
執行以下 SQL，確保舊表資料量與新表完全一致：
```sql
-- 這兩個數字應該要一模一樣
SELECT 
  (SELECT count(*) FROM test_cases) as legacy_count,
  (SELECT count(*) FROM tcms_test_cases) as new_system_count;
```

### 3.3 驗證資料獨立性 (核心測試)
這一步能證明兩邊真的不再互相影響：
1. **新增測試**：手動在 `tcms_users` 新增一筆測試資料。
2. **檢查**：確認舊的 `users` 表格**沒有**出現這筆資料。
3. **結論**：若舊表沒變動，代表「手術成功」，兩系統已完全脫鉤。

---

## 4. 服務功能冒煙測試 (UI Check)

1. **TCMS 1.5 介面**：開啟瀏覽器進入系統，確認「測試案例 (Test Cases)」清單能正常顯示（這代表 `tcms_` 表正常）。
2. **舊系統/自動化服務**：執行任一個簡單的自動化查詢腳本，確認能讀到資料且不報錯（這代表 `users` / `test_cases` 等舊表名正常）。

---

## 5. 萬一失敗的緊急回滾 (Rollback)

如果發生任何不可預期的錯誤，請立刻使用還原腳本：
```bash
# 選擇您在步驟 1.1 剛剛才做好的那份備份（檔名通常為 qa_automation_YYYYMMDD_HHMMSS.sql.gz）
bash /data/docker-postgres/scripts/db_restore.sh [備份檔名].sql.gz
```
這會將資料庫回復到執行任何改動前的狀態。詳見 [DATABASE_RECOVERY_AND_BACKUP.md](DATABASE_RECOVERY_AND_BACKUP.md)。
