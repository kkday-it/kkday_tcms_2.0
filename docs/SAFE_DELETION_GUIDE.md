# 安全刪除與還原機制 (Safe Deletion & Restore) 功能說明

本文件說明 TCMS 1.5 中實作的「安全刪除」與「一鍵還原」機制。此機制旨在防止資料意外遺失，並在不給予資料庫帳號實體 `DELETE` 權限的情況下，依然提供完整的刪除體驗。

## 1. 核心設計理念：邏輯刪除 (Soft Delete)

在 TCMS 1.5 中，針對核心資料（Test Case, Test Plan, Test Run），點擊「刪除」按鈕後，系統**不會**從資料庫硬碟中移除資料，而是將該筆資料標記為 `Archived` (已封存)。

*   **自動隱藏**：所有一般的清單 API 都會自動過濾 `status = 'Archived'` 的資料，使用者在畫面上會感覺資料已被刪除。
*   **權限防護**：由於後台執行的是 `UPDATE` 而非 `DELETE`，即便 API 權限被濫用，也無法真正摧毀資料庫中的數據。

## 2. 支援模組

目前以下模組已全面支援安全刪除與還原：

| 模組 | 封存後狀態 | 還原後狀態 | 歷史紀錄支援 |
| :--- | :--- | :--- | :--- |
| **Test Case** | Archived | Active | 是 (TestCaseHistory) |
| **Test Plan** | Archived | Draft | 是 (TestPlanHistory) |
| **Test Run** | Archived | Pending | 是 (TestRunHistory) |

## 3. 操作說明

### 刪除 (封存)
呼叫各模組的 `DELETE` 端點：
*   `DELETE /api/v1/cases/{id}`
*   `DELETE /api/v1/plans/{id}`
*   `DELETE /api/v1/runs/{id}`

### 還原 (Restore)
呼叫各模組新增的 `restore` 端點，將資產狀態恢復至預設可用狀態：
*   `POST /api/v1/cases/{id}/restore`
*   `POST /api/v1/plans/{id}/restore`
*   `POST /api/v1/runs/{id}/restore`

### 查詢歷史變更項目
可以透過歷史紀錄介面（或 API）查看是誰在什麼時候執行了封存或還原：
*   `GET /api/v1/cases/{id}/history`
*   `GET /api/v1/plans/{id}/history`
*   `GET /api/v1/runs/{id}/history`

## 4. 管理員專區 (後續規劃)
未來將在前端介面新增「Archive (封存區)」資料夾，管理員可以在該處看到所有被標記為 `Archived` 的項目，並執行「永久刪除 (Hard Delete)」或「批量還原」。

---
*Last Updated: 2026-03-13*
