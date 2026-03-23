# PR: tcms_March_1 → master

## 標題

```
feat(tcms): TCMS UI 強化 — 繁中化、Timeline 甘特圖、Test Plan Clone、Sidebar 收合、Case Filter 左右配置
```

---

## 關聯 Jira Epic

**[KQT-14156](https://kkday.atlassian.net/browse/KQT-14156)** — [QA] new TCMS system

| Sub-task | 說明 | 狀態 |
|----------|------|------|
| [KQT-14166](https://kkday.atlassian.net/browse/KQT-14166) | [Test case] 固定 import 工具（同 export） | ✅ 完成 |
| [KQT-14262](https://kkday.atlassian.net/browse/KQT-14262) | [Test case] case filter 改成左右配置 | ✅ 完成 |
| [KQT-14268](https://kkday.atlassian.net/browse/KQT-14268) | [UI] 功能列可收合 + 字體繁中 | ✅ 完成 |
| [KQT-14271](https://kkday.atlassian.net/browse/KQT-14271) | [Test Run] Regression 批次複製（資料夾階層） | ✅ 完成（含於前次 master） |

---

## 改動概覽

### Epic 1 — UI 繁體中文化（KQT-14268）

**涵蓋頁面**：Login、Dashboard、TestPlanDetails

| 檔案 | 改動說明 |
|------|---------|
| `src/pages/Login.tsx` | 登入頁全面繁中：「登入 TCMS」、「使用 Google 登入」、欄位標籤、錯誤訊息 |
| `src/pages/Dashboard.tsx` | 儀表板繁中：KPI 標籤、表格欄位、圖表圖例、空狀態文字 |
| `src/pages/TestPlanDetails.tsx` | 下半部繁中：通過率、完成率、結果分佈、測試執行 / 案例 tab、表格欄位、Jira 區塊標題 |

---

### Epic 2 — Sidebar 收合功能（KQT-14268）

| 檔案 | 改動說明 |
|------|---------|
| `src/components/layout/MainLayout.tsx` | 新增 `isSidebarExpanded` state，sidebar 可收合至 icon-only 模式（`w-44` ↔ `w-14`），收合時顯示展開按鈕，各 nav item 收合後隱藏文字標籤 |

---

### Epic 3 — Test Plan 強化

#### 3-1 Clone 功能
| 檔案 | 改動說明 |
|------|---------|
| `backend/app/api/test_plans.py` | 新增 `POST /plans/{plan_id}/clone`：複製所有欄位，title 加 `(複製)` 後綴，status 重設為 Draft，保留 run_ids / case_ids |
| `src/pages/TestPlans.tsx` | 計畫卡片新增複製按鈕（emerald），呼叫 clone API 後重新整理列表 |

#### 3-2 文件 + 時程版面重構
| 檔案 | 改動說明 |
|------|---------|
| `src/pages/TestPlanDetails.tsx` | 文件連結 + 專案時程區塊從左右 grid 改為上下 flex-col；兩區塊內容改為 `flex-wrap` 橫向排列 |

#### 3-3 Timeline 甘特圖（全新設計）
| 檔案 | 改動說明 |
|------|---------|
| `src/pages/TestPlanDetails.tsx` | 新增 `TimelineRow` 介面與 `GanttTimeline` 元件：<br>• 每平台獨立 RD / UED / QA 時程橫條<br>• 純 CSS absolute positioning（無外部套件）<br>• 智慧 tick 間距（3 / 7 / 14 / 30 天）<br>• 今日紅線標記<br>• 起訖日期標記（含 `-translate-x-1/2` 精確對齊）<br>• UTC 時區修正（`new Date(y, m-1, day)` local constructor）<br>• 舊格式（`{rd, ued, qa[]}`）backward compat fallback |
| `src/components/plans/EditPlanModal.tsx` | 時程編輯改為 `TimelineRow[]` 結構，支援 Android / iOS / PC / M 快速新增，自訂平台，舊格式自動轉換；modal 加寬至 `max-w-5xl` |

---

### Epic 4 — Case Filter 左右配置（KQT-14262）

| 檔案 | 改動說明 |
|------|---------|
| `src/components/runs/CreateRunModal.tsx` | Case 選取區改為左右配置：左側 filters panel（`w-56`）+ 右側 case tree，modal 加寬至 `max-w-6xl` |
| `src/components/runs/EditRunModal.tsx` | 同 CreateRunModal，case filter 改為左右配置 |

---

### Epic 5 — Import 工具固定顯示（KQT-14166）

| 檔案 | 改動說明 |
|------|---------|
| `src/pages/Repository.tsx` | Import 改為下拉選單（Zephyr XML / XMind），固定顯示於 toolbar，與 Export 對稱 |

---

### Epic 6 — Test Run 細節優化

| 檔案 | 改動說明 |
|------|---------|
| `src/pages/TestRuns.tsx` | 執行者由首字母圓圈頭像改為顯示完整姓名的 pill 標籤（最多 3 人，超過顯示 +N） |

---

## 技術備註

- Timeline 資料結構：舊格式 `{ rd, ued, qa[] }` → 新格式 `{ rows: [{ platform, rd_start, rd_end, ued_start, ued_end, qa_start, qa_end }] }`，兩者均相容
- Clone endpoint 複用既有 `_load_plan`、`_set_runs`、`_set_cases` helper，無額外 DB migration
- Sidebar collapse 狀態為 component-level state（無需持久化）

---

## Checklist

- [x] 相關 Jira sub-tasks 對應確認
- [x] 舊 Timeline 格式 backward compat 測試
- [x] Clone API 正確重設 status = Draft
- [x] UTC 日期解析修正（`new Date(y, m-1, day)`）
- [ ] CI 通過
