# 專案任務 Excel 匯出(現有任務 round-trip)— 設計文件

- 日期:2026-06-23
- 狀態:設計已確認(使用者同意),待寫實作計畫
- 範圍:在既有「Excel 匯入」功能上,新增「匯出現有任務」;分支 `feature/project-excel-import`(接在匯入功能後)

## 1. 目標

讓使用者把選定專案的**現有任務**匯出成與匯入範本**完全相同欄位格式**的 `.xlsx`,在 Excel 批次檢視/修改後,再用既有「匯入」(同名更新)整批回寫。形成 匯出 → 編輯 → 匯入 的 round-trip。保留既有「下載範本」(空白範本)。

## 2. 行為

匯入對話框新增「匯出現有任務」按鈕(與「下載範本」並列)。點擊 → 下載 `<專案名>-任務匯出.xlsx`,內容為該專案**所有任務(含已完成 done / 已封存 archived)**,每列一個任務,欄位與範本一致。

## 3. 欄位值對應(與範本 HEADER_ORDER 同欄)

| 欄 | 匯出內容 |
|---|---|
| 任務名稱 | `title` |
| 描述 | `description`(null → 空白) |
| 優先級 | 中文:`low→低`、`medium→中`、`high→高`、`urgent→緊急` |
| 狀態 | 中文:`todo→待辦`、`in_progress→進行中`、`done→完成`、`archived→封存` |
| 開始日 | `yyyy/M/d`(如 `2026/6/30`);null → 空白 |
| 截止日 | 同開始日 |
| 負責人 | `assigneePlaceholderId` → 掛名成員名稱;若無但有真人 `assigneeId` → 該成員名稱;皆無 → 空白 |
| 標籤 | 該任務的標籤名,逗號分隔(`購料,急件`) |
| 上層任務名稱 | `parentTaskId` → 父任務的 `title`;無 → 空白 |

輸出格式 = 匯入格式;匯入以「`projectId` + `title`」同名更新,因此匯出→改→匯入會**更新原任務**而非重複新增。

## 4. 技術(沿用既有匯入基礎)

- `server/import/xlsx.ts`:新增 `buildExportWorkbook(dataRows: string[][]): Promise<Buffer>` —— 用既有 `HEADER_ORDER` 寫第一列標題,接著逐列寫 `dataRows`,回傳 xlsx buffer。(不含範例列;可選擇是否附「說明」頁,預設不附,保持乾淨。)
- `server/import/exportFormat.ts`(純函式,可測):
  - `priorityToZh(p)`, `statusToZh(s)` —— 反向 enum 對照(碼 → 中文)。
  - `formatDate(d: Date | null): string` —— `yyyy/M/d`,null → `""`。
  - `taskToRow(task, ctx): string[]` —— 依 §3 組出與 `HEADER_ORDER` 同序的字串陣列;`ctx` 提供 placeholder/member 名稱對照、tag 名稱對照、taskId→title 對照。
- `server/import/importService.ts`:新增 `buildExport(userId, projectId): Promise<Buffer>`:
  1. **先驗證擁有權**(`checkUserOwnsProject`,沿用匯入的 FORBIDDEN 模式)。
  2. 讀資料:`listTasksByProject`(全部任務)、`listPlaceholders`、`listWorkspaceMembers`、`listTags`、`listTaskTags`。
  3. 建對照表(placeholderId→name、memberId→name、tagId→name、taskId→tagNames[]、taskId→title)。
  4. 逐任務 `taskToRow` → `dataRows`,呼叫 `buildExportWorkbook` 回 buffer。
- tRPC:`projectImport.export`(query,輸入 `{ projectId: number }`,**含擁有權檢查**,回 `{ filename: string; base64: string }`)。
- 前端 `client/src/components/project/ImportExcelDialog.tsx`:加「匯出現有任務」按鈕,點擊呼叫 export query,base64→Blob 下載(沿用既有 template 下載寫法);檔名 `<專案名>-任務匯出.xlsx`(專案名由現有 props/context 取得,取不到則用 `任務匯出.xlsx`)。

## 5. 測試

- `exportFormat.test.ts`(純函式):`priorityToZh`/`statusToZh` 四值對照、`formatDate`(含 null 與不補零)、`taskToRow` 對一個含標籤/掛名/父任務/完成狀態的任務輸出正確欄序與值。
- 整合測試(`importService.test.ts` 內或新檔,連 `daily_todo_test`):建任務(含標籤、掛名負責人、子任務、done 狀態)→ `buildExport` → 用既有 `parseWorkbook` 解析回來,斷言各欄值正確(中文 enum、tags join、父任務名、日期),證明可被既有匯入吃回去。

## 6. 不做(YAGNI)

- 不做 csv 匯出、不做欄位篩選/排序選項、不匯出顏色。
- 不改既有匯入邏輯(只新增匯出路徑與一顆按鈕)。

## 7. Global Constraints

- 用 **pnpm**;沿用 `exceljs`、既有 db 層、`HEADER_ORDER`/`COLUMNS`。
- 匯出路徑**必須驗證使用者擁有該專案**(與匯入一致,非擁有者 → FORBIDDEN)。
- `pnpm run check` 0 錯、`pnpm run build` 成功、`pnpm test` 不低於現況 99 綠;新邏輯要有測試。
- 匯出格式必須能被既有「匯入」直接吃回(round-trip 可驗)。

## 8. 驗收

1. 專案頁 → 匯入對話框出現「匯出現有任務」與「下載範本」兩顆按鈕。
2. 點「匯出現有任務」下載 xlsx,內含該專案所有任務(含完成/封存),欄位與範本一致、值正確(中文 enum、日期、標籤、負責人、上層任務名)。
3. 不改檔直接「匯入」該檔 → 預覽全部為「更新」、確認後無重複新增、資料不變。
4. 在匯出檔改幾筆再匯入 → 對應任務被更新。
5. 非擁有者呼叫 export → FORBIDDEN。
6. `pnpm run check` 0 錯、`pnpm run build` 成功、既有測試不退步、新測試綠。
