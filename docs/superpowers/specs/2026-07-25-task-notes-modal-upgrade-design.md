# 任務筆記視窗升級:可改名稱 + 圖片附件(Matrix / Work / Life 共用)

日期:2026-07-25
狀態:已與使用者確認設計

## 背景與問題

- Eisenhower Matrix 頁面([EisenhowerMatrix.tsx](../../../client/src/pages/EisenhowerMatrix.tsx))的任務建立後**無法改名稱、無法記筆記**,只有勾選完成和刪除。
- Work/Life 頁([TaskList.tsx](../../../client/src/pages/TaskList.tsx))有 [TaskNotesModal](../../../client/src/components/TaskNotesModal.tsx) 小視窗,但只支援**文字筆記 + 優先級**,不能改名稱、不能放圖片。
- 使用者需求:Matrix 任務要能像 Life 任務一樣開小視窗,且視窗要支援**改名稱 + 文字筆記 + 圖片**。

## 範圍決策(已確認)

1. **適用範圍**:升級共用的 TaskNotesModal,Matrix 與 Work/Life 頁都使用同一個視窗。
2. **圖片輸入**:檔案選擇器上傳 + 視窗內 Ctrl+V 貼上剪貼簿截圖。
3. **優先級選單**:Work/Life 維持顯示;Matrix 任務隱藏(象限已決定優先級,於視窗內改優先級不會移動象限,徒增混淆)。

## 現有基礎(全部沿用,後端零改動)

- 三種任務(work/life/eisenhower)同存 `tasks` 表;`tasks.update` tRPC 已支援 `title`、`description`。
- 附件系統現成:`attachments` 表、`POST /api/tasks/:taskId/attachments`(multer,50MB 上限,ownership 檢查)、`trpc.attachments.list` / `trpc.attachments.delete`、`/uploads` 靜態檔案服務。
- Work/Life 的 InteractiveTaskCard 已有雙擊改名與筆記按鈕;Matrix 頁自製任務列未接任何機制。

## 設計

### 1. TaskNotesModal 升級(client/src/components/TaskNotesModal.tsx)

- **標題編輯**:DialogTitle 由純文字改為 Input,預填 `task.title`;標題 trim 後為空時儲存鈕 disabled。
- **優先級**:以 `task.category === 'eisenhower'` 判斷隱藏;其餘維持現狀。props 的 task 物件需帶 `category`。
- **文字筆記**:textarea 維持不變。
- **圖片區(新)**:
  - 視窗開啟時以 `trpc.attachments.list.useQuery({ taskId })` 載入附件。
  - 「上傳圖片」按鈕開檔案選擇器(`accept="image/*"`),FormData POST 到 `/api/tasks/:taskId/attachments`,成功後 invalidate 附件列表。
  - 視窗容器監聽 `onPaste`:自剪貼簿萃取 image file(命名 `screenshot-<timestamp>.png`)走同一上傳流程。
  - 縮圖網格顯示(僅圖片檔以 <img> 縮圖呈現;其他檔案類型以檔名 chip 呈現,與 TaskDetailDrawer 慣例一致);點縮圖新分頁開原圖;hover 顯示刪除鈕,刪除走 `trpc.attachments.delete`。
  - 圖片上傳/刪除為即時生效(非隨「保存」一起提交);「保存」只負責標題、筆記、優先級。
- **onSave 介面變更**:`onSave(taskId, updates: { title?: string; description: string; priority?: string })`——title 僅在有變更時帶上。兩個呼叫端(TaskList、EisenhowerMatrix)同步調整。

### 2. EisenhowerMatrix 頁面

- 任務列 hover 顯示筆記圖示按鈕(置於刪除 X 旁);點任務文字或筆記按鈕皆開啟 TaskNotesModal。
- 已有 description 的任務,標題旁常駐顯示小筆記圖示作為提示。
- 新增 modal 開關 state 與 selectedTask state;儲存用既有 `updateTaskMutation`,成功後 invalidate `tasks.list`(eisenhower)。

### 3. 後端

零改動。既有 API 已滿足全部需求;Matrix 任務與 Life 任務同表,附件天然可用。

### 4. 錯誤處理

- 上傳失敗 / 逾 50MB → toast 錯誤(沿用 TaskDetailDrawer 的檢查模式,但以 toast 取代 alert)。
- 儲存失敗 → 維持現有 toast 行為。
- 空標題 → 前端擋下(disabled),後端 zod `min(1)` 為第二道防線。

### 5. 測試策略

- 專案測試環境為 vitest node(client 只測 `client/src/lib` 純邏輯),依此慣例走 TDD:
  - `client/src/lib/taskNotesSave.ts`(新):組裝 save payload——標題變更偵測、空標題擋下、eisenhower 不帶 priority。先寫測試再實作。
  - `client/src/lib/clipboardImage.ts`(新):自 ClipboardEvent items 萃取 image File 與命名邏輯。先寫測試再實作。
- 元件與端到端行為以 dev 環境(port 4179)實際操作驗證:Matrix 開視窗改名稱、寫筆記、上傳與貼上圖片、刪圖、Work/Life 回歸檢查。

## 不做的事(YAGNI)

- 不引入富文本編輯器、不做圖片內嵌於筆記文字。
- 不改 Matrix 象限拖曳/移動邏輯。
- 不動資料庫 schema 與後端 API。
