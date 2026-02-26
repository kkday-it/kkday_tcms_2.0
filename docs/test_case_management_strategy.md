# TCMS 架構設計：Test Case 分類與 Test Run 執行策略

在現代的測試管理平台（如 Qase, TestRail, Zephyr）中，管理 Test Cases 的分類方式對於系統長期的維護性與資料一致性至關重要。

## 1. 📂 關於「資料夾 (Project Suites / Folders)」：不建議用 Feature / Regression 來分類

**為什麼不建議？**
一條 Test Case 的生命週期通常是：剛開發時是 Feature Test，等功能上線穩定後，這條 Case 就會被納入長期的 Regression Test。
如果你將 Feature 和 Regression 當成資料夾，就會需要將 Test Case **搬來搬去**，或者更糟的是**複製兩份**（一份放在 Feature，一份放在 Regression），這會導致版本不一致、難以維護（單一事實來源 Single Source of Truth 被破壞）。

**✨ 最佳實踐做法：用「產品模塊 (Domain/Module)」做資料夾**
Repository 結構應該反映系統的真實架構。可以直接把業務領域當作最上層的 Project Suites (Folders)，例如：
*   **B2C**
*   **Trans**
*   **FA**
*   **SCM**

然後在這些領域資料夾內，依據畫面或功能模組往下細分（例如：`B2C > 購物車 > 結帳流程`）。

---

## 2. 🏷️ 如何區分 Feature 還是 Regression？：使用「屬性 (Type) 或 標籤 (Tags)」

在 `TestCase` 模型中，應該利用 `type` 或 `tags` 等欄位來定義測試案例的**屬性**。

**實際操作情境：**
1. 某 Squad 正在開發一個新的 B2C 功能（例如 Apple Pay 結帳）。
2. 在 `B2C > 購物車` 資料夾下新建了 Test Cases，並把屬性/標籤設定為 **`[Feature]`**，可能再加一個標籤 **`[Squad-A]`**。
3. 兩週後，這個功能順利上線且穩定。這時候只要編輯這幾條 Test Cases，把標籤改為 **`[Regression]`**（代表它成為每次大版號回歸必測的基本盤）。
*註：Case 一直都躺在同一個業務模組的資料夾裡，只是身上的標籤變了。*

---

## 3. 🚀 關於 Test Run (測試執行) 的運作方式

「每兩週的 regression 就是用 test run 來區隔」，這是現代 QA 流程中最標準且正確的用法。

**實際操作情境：**
1. 來到雙週大版號發布時間。
2. 建立一個新的 Test Run，命名為 `Release 2026-02-25 Bi-weekly Regression`。
3. 在挑選 Test Cases 加入這個 Run 時，**利用篩選器 (Filter) 勾選：「抓出 Repository 中所有標籤包含 `Regression` 的案例」**，或者只針對「特定的資料夾 (例如 B2C) + Regression 標籤」抓取特定的子集測試。
4. 這樣就能動態產生這兩週需要跑的任務包，分派給 QA 執行。
5. （同理，如果只要測某個 Squad 的 Feature，就可以建一個 `Squad-A Feature Test Run`，並篩選標籤為 `[Squad-A] & [Feature]` 的 Case 來專注執行）。

---

## 小結：系統介面設計的配合點

如果採用這個最佳實踐，目前我們架構中的設計方向是：
1. **Repository (Test Cases)：** 作為穩定的儲存庫，依據 **業務領域** (B2C/FA 等) 建立樹狀資料夾（Suites）。
2. **Metadata：** 善用欄位（Priority, Automation status）以及 **Tags/Type** 來進行動態分類與過濾。
3. **Test Runs：** 每次的雙週回歸、臨時 Hotfix 測試、單一專案測試，都是透過 **「建立一次性的 Test Run + 動態篩選案例」** 來執行，同時留存測試報告。

未來前端在實作時，會將「Filter (篩選屬性/標籤)」以及「在建立 Test Run 時可以透過多種條件批次勾選 Case」的 UI/UX 作為提升 QA 效率的核心重點。
