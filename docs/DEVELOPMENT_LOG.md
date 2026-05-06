# TCMS 1.5 開發紀錄 (Development Log)

本文件專注於紀錄 TCMS 1.5 測試管理系統的核心功能開發、架構優化與關鍵修復。

## 2026-05: External ID 強化與並發保護

### 2026-05-06: External ID 管理辦法（PR: feature/external-id-hardening）

**背景**：PR #647 已實作 `external_id` 自動生成（`KQT-T{50000+id}`），本次針對 Zephyr 搬家期間發現的管理漏洞進行全面加固。

#### 變更重點

**1. External ID 設為不可變欄位**
- `PUT /api/v1/cases/{id}` 即使傳入 `external_id` 也會被忽略，不影響現有值
- Schema 層（`TestCaseUpdate`）已移除對 `external_id` 的寫入入口

**2. 唯一性約束（DB + 應用層雙重保護）**
- 資料庫層：新增 `UNIQUE constraint`（`uq_tcms_test_cases_external_id`）
- 應用層：`POST /api/v1/cases/` 建立前先查重，重複時回傳 `409 Conflict`
- Migration 執行前自動清理舊有重複資料（保留最舊的 id）

**3. Zephyr Import 重複處理策略**
- `POST /import/zephyr?strategy=skip`（預設）：重複的 external_id 跳過，回傳 `skipped_keys`
- `POST /import/zephyr?strategy=overwrite`：以 XML 內容覆蓋既有 case（title、description、steps）
- 適合搬家期間（skip）與需要重新同步（overwrite）兩種場景

**4. Optimistic Locking（並發衝突保護）**
- 新增 `version` INT 欄位（初始值 0，每次成功 PUT + 1）
- Client 帶 `version` 欄位時啟用衝突檢查：版本不符回傳 `409 Conflict`，並附帶 `case_title` 與 `current_version`
- 不帶 `version` 時維持 last-write-wins（向後相容）

#### 409 Conflict 回應格式

重複 external_id（建立時）：
```json
{"detail": "external_id 'KQT-T123' 已存在，請使用不同的 ID"}
```

並發衝突（更新時）：
```json
{
  "detail": {
    "error": "conflict",
    "message": "「登入流程驗證」已被他人修改，請重新整理後再編輯",
    "case_title": "登入流程驗證",
    "current_version": 6
  }
}
```

#### Migration 說明
- 檔案：`alembic/versions/a1b2c3d4e5f6_external_id_unique_and_version.py`（revision: `f857c452af6f`）
- 執行：`set -a && source .env && set +a && alembic upgrade head`

---

## 2026-03: 系統架構隔離與功能深化

### Week 2 (本週進度)
- **2026-03-13**: **資料庫表解耦 (Database Decoupling)** - 成功完成 15 張核心表（如 `users`, `test_cases`）由 View 轉為獨立實體 Table，徹底切斷與舊系統的物理連結。
- **2026-03-13**: **資源回收桶 (Trash Bin)** - 實作測試案例、測試計畫與執行紀錄的「軟刪除」與「一鍵還原」功能。
- **2026-03-12**: **資料庫安全加固** - 部署 `ai_worker` 專用帳號與實施 DDL 操作限制，確保 AI 代理人無法誤刪 TCMS 核心結構。
- **2026-03-11**: **系統災難復原檢討** - 完成 3 月初資料庫修復總結，建立全新的自動化備份與驗證規範。

### Week 1
- **2026-03-05**: **TCMS 整合與 UI 升級**
    - **Jira v3 整合**：更新 Jira API 呼叫至 v3 版本，解決 410 錯誤，恢復測試計畫與 Jira Ticket 的數據關聯。
    - **Tiptap 編輯器**：於測試步驟中導入 Tiptap 富文本編輯器，支援更靈活的步驟描述。
    - **Google 登入**：支援 Google OAuth 2.0 協議，實現系統免密連動。
    - **子路徑部署**：修復 Nginx 在 `/tcms` 子路徑下的路由與 API 代理問題。
- **2026-03-02**: **基礎架構與報表**
    - **Allure 報表整合**：整合 Allure 測試報告，提供視覺化執行結果分析。
    - **XMind 匯入工具**：開發 `xmind_import.py`，支援將 XMind 腦圖直接轉化為 TCMS 測試案例。
    - **命名空間隔離**：為所有 1.5 版本的表格加上 `tcms_` 前綴，確保資料庫層級的命名空間獨立。

## 2026-02: TCMS 核心功能建構

- **2026-02-26**: **TCMS 1.5 核心發布**
    - 實作測試計畫資料夾管理系統。
    - 建立測試執行 (Run) 與測試案例 (Case) 的關聯綁定機制。
    - 開發測試計畫詳情報告頁面。
- **2026-02-24**: **Jira 視覺化面板**
    - 在測試計畫中新增 Jira Chart 配置，支援於 TCMS 內直接渲染 Jira 狀態分布圖。
    - 統一 Jira 面板與 Timeline 的扁平化視覺風格。

## 2026-01: 專案前期準備

- **2026-01-23**: **資料庫初始化與 Migration 規範**
    - 確立 TCMS 1.5 與 PostgreSQL 的相容性遷移方案。
    - 建立基礎資料模型 (Project, Suite, Case, Run)。
