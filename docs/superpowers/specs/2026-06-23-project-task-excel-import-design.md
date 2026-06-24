# 專案任務 Excel 批次匯入 — 設計文件

- 日期:2026-06-23
- 狀態:設計已確認(使用者同意),待寫實作計畫
- 範圍:`daily-todo-app` 的專案管理(project)新增「Excel 一鍵匯入任務」功能;分支 `feature/project-excel-import`(從目前 HEAD 起)

## 1. 問題與目標

使用者上班忙,沒時間在系統上一個一個手填任務,導致專案管理功能長期沒在用。目標:**讓使用者在 Excel 批次填好任務,一鍵上傳灌進指定專案**,大幅降低建立任務的時間成本。

## 2. 使用流程

在專案頁面工具列新增「匯入 Excel」按鈕,開啟對話框:

1. **下載範本**:取得 `.xlsx` 範本(含欄位標題列、一列範例、一頁「說明」列出各欄接受值)。
2. **選檔上傳**:選填好的 `.xlsx`。
3. **預覽**:顯示摘要「新增 X 筆 / 更新 Y 筆 / 錯誤 Z 筆」,並逐列標示動作(新增/更新/錯誤)與錯誤原因。
4. **確認匯入**:使用者按「確認」才真正寫入目前選定的專案。

匯入目標 = 使用者在 UI 已選定的「單一專案」。每一列 = 一個任務。

## 3. Excel 欄位定義

第一列為標題列,欄位順序如下(以標題文字辨識,不靠欄位位置):

| 欄標題 | 必填 | 對應 task 欄位 | 接受值 / 規則 |
|---|---|---|---|
| 任務名稱 | ✅ | `title` | 任意文字;空白 → 該列錯誤 |
| 描述 | | `description` | 任意文字 |
| 優先級 | | `priority` | `低/中/高/緊急` 或 `low/medium/high/urgent`;空白 → `medium` |
| 狀態 | | `status` | `待辦/進行中/完成/封存` 或 `todo/in_progress/done/archived`;空白 → `todo` |
| 開始日 | | `startDate` | `2026/6/30`、`2026-06-30`、或 Excel 日期格;空白 → null |
| 截止日 | | `dueDate` | 同開始日;空白 → null |
| 負責人 | | `assigneePlaceholderId`(掛名成員) | 人名;在該 workspace 比對名稱,不存在則自動建立掛名成員 |
| 標籤 | | `taskTags`(多對多) | 逗號分隔(中/英文逗號皆可),如 `購料,急件`;各標籤在該專案比對名稱,不存在則自動建立 |
| 上層任務名稱 | | `parentTaskId` | 填同表或同專案另一任務的「任務名稱」→ 設為其子任務 |

備註:
- `status=完成/done` 時同步設 `completed=true` 與 `completedAt`(沿用系統既有 status↔completed 同步邏輯)。
- 專案任務的 `category` 留空(沿用系統建立專案任務時的既有作法)。
- `userId` = 目前登入使用者;`projectId` = 選定專案。

## 4. 比對與寫入規則

### 4.1 Upsert(同名就更新)
- Upsert 鍵 =(`projectId` + `title`)。同名既有任務 → 更新其欄位;無同名 → 新增。
- 若同專案內已存在「多筆」同名任務 → 該列標記錯誤「同名任務多筆,無法判斷」並跳過(不更新任何一筆)。
- 更新時只覆寫表內有提供的欄位;Excel 留白的選填欄不覆寫既有值(避免一鍵清空)。**例外**:必填的 title 必有值。

### 4.2 子任務(兩段式解析)
1. 第一段:建立/對齊所有列的任務(取得各自 taskId)。
2. 第二段:依「上層任務名稱」回填 `parentTaskId` —— 先在本次匯入的任務中找,再在同專案既有任務中找。
3. 找不到上層 → 任務仍建立,但該列標警告「找不到上層任務,已建為頂層」。
4. 防自我參照與循環:列的上層名稱等於自己 → 警告並忽略 parent。

### 4.3 負責人 / 標籤自動建立
- 負責人:在選定專案的 `workspaceId` 內以名稱比對 `placeholder_members`,無則建立。
- 標籤:在選定 `projectId` 內以名稱比對 `tags`,無則建立;再寫 `task_tags` 關聯。

## 5. 技術設計

### 5.1 套件
- 後端用 **`exceljs`**(MIT 授權)做兩件事:(a) 讀取上傳的 `.xlsx`;(b) 產生下載範本(含說明頁)。只支援 `.xlsx`(v1 不收 csv)。

### 5.2 後端(tRPC,projects router 或新 `projectImport` router)
- `importPreview`:input = 上傳檔(base64)+ `projectId`。解析 + 逐列驗證,**不寫入**。回傳:
  ```
  {
    summary: { create: number, update: number, error: number, warning: number },
    rows: Array<{
      rowNum: number,
      action: "create" | "update" | "error",
      task: NormalizedTaskInput,   // 已正規化(enum 轉碼、日期轉 Date、tags 陣列、assigneeName、parentName)
      messages: string[]           // 錯誤/警告說明
    }>
  }
  ```
- `importCommit`:input = `projectId` + 已驗證的 `rows`(NormalizedTaskInput 陣列)。**伺服器端再驗證一次**(不信任前端送來的內容),再依 §4 規則寫入。回傳實際 `{ created, updated, skipped, warnings }`。
- 範本下載:走既有檔案/路由機制或一個 tRPC/HTTP endpoint 回傳 xlsx bytes。

### 5.3 前端
- `ProjectToolbar` 加「匯入 Excel」按鈕 → 開 `ImportExcelDialog`:
  - 下載範本連結。
  - 檔案選擇(僅 `.xlsx`)。
  - 上傳後呼叫 `importPreview`,顯示摘要 + 可捲動的逐列結果表(動作標色、錯誤列標紅並列原因)。
  - 「確認匯入」呼叫 `importCommit`,成功後關閉並重整任務清單(toast 報結果)。

### 5.4 驗證細節
- enum 對照(中/英→碼);非法值 → 該列錯誤並指出欄位。
- 日期:支援 Excel 日期序號(exceljs 給 JS Date)、`yyyy/m/d`、`yyyy-mm-dd`;無法解析 → 該列錯誤。
- 每列獨立驗證:壞列不擋好列;預覽如實呈現。
- 檔案大小/列數上限(例如 ≤ 2000 列)以防超大檔;超過 → 擋下並提示。

## 6. 不做(YAGNI)

- 不做任務相依/前置(Gantt 連線關係)。
- 不做顏色欄、不收 `.csv`、不做「一張表跨多專案」、不做匯出。
- 不做欄位自訂對應(固定模板欄位)。
- 不改既有手動建立任務的流程。

## 7. Global Constraints

- 用 **pnpm**;新增相依 `exceljs`。
- 不破壞既有功能與測試(`pnpm test` 不低於現況 83 綠);新增邏輯需有測試(正規化/驗證/upsert/子任務解析)。
- `pnpm run check` 0 錯、`pnpm run build` 成功。
- 寫入一律綁目前使用者 + 選定專案;沿用既有 db 層與 status↔completed 同步邏輯,不另造平行邏輯。

## 8. 驗收

1. 專案頁可下載範本(.xlsx,含說明頁)。
2. 填 5~10 列(含必填缺漏、非法優先級、同名更新、子任務、未知負責人/標籤各一例)上傳 → 預覽正確分類(新增/更新/錯誤/警告)並列出原因。
3. 按確認 → 任務正確寫入選定專案:新增/更新筆數符合預覽;負責人與標籤自動建立並關聯;子任務 parent 正確;完成狀態的任務 `completed=true`。
4. 壞列被跳過、不影響好列;重複上傳同表 → 同名任務被更新而非重複新增。
5. 單元測試涵蓋:enum/日期正規化、必填驗證、upsert 比對、子任務兩段式、同名多筆衝突。
6. `pnpm run check` 0 錯、`pnpm run build` 成功、既有測試不退步。
