# 筆記「儲存功能」— 設計規格

日期:2026-06-10

## 目標

在筆記編輯視窗加入**明確的手動「儲存」**,並保留現有自動存當保險,讓使用者(在剛遇到掉資料後)對「有沒有存到」有清楚掌控與回饋。

## 範圍與原則

- 只動筆記編輯視窗 `client/src/components/notes/NoteEditorModal.tsx` 與一個新的純函式檔。
- **保留**現有的:自動存(停打字 300ms 防抖)+ 關閉即存(flush-on-close)。
- 不動後端(`notes.update` 既有,接受 title/content)。

## 功能

### 1. 手動「儲存」按鈕
- 位置:編輯視窗右上工具列(顏色 / 刪除 / 關閉 那一排,放在前面)。
- 行為:點擊 → 立即 `notes.update({ id, title, content })`。
- 狀態:無「未儲存」變更時 disabled(避免重複無謂寫入)。

### 2. 儲存狀態指示(右上小字)
依下列優先序顯示其一:
- **儲存中…** — `update.isPending` 為 true。
- **未儲存** — 有未儲存變更(見 §3)。
- **已儲存** — 其餘情況(與伺服器一致)。

### 3. 「未儲存」判定(純函式,可測)
`isNoteDirty(title, content, note)`:
- 回傳 `title !== note.title || content !== (note.content ?? "")`。
- 顏色/標籤/釘選/關聯專案本來就一改即時存,不納入此判定。

### 4. `Cmd/Ctrl + S` 快捷鍵
- 視窗開啟時,監聽 keydown;按下 `Cmd+S`(Mac)/`Ctrl+S`(Win)→ `preventDefault()` 並觸發同一個儲存動作(避免叫出瀏覽器存檔)。
- 視窗關閉(元件卸載)時移除監聽。

## 資料流

- 「已儲存的值」以 `note` prop 為準(伺服器最後狀態;每次 `notes.update` 成功後 `utils.notes.list.invalidate()` → `note` 刷新 → dirty 變 false → 顯示「已儲存」)。
- 手動存、自動存、Cmd+S 三者都呼叫同一個 `saveNow()`,內容一致、互不衝突。

## 不在範圍(YAGNI)

- 不做:儲存歷史/版本、衝突合併、離線佇列、其他頁面(任務抽屜)的儲存鈕(可日後再說)。

## 驗證方式

- **TDD**:`isNoteDirty` 純函式寫單元測(相同→false、標題改→true、內文改→true、content null 視為空字串)。
- **實機**:改字 → 指示變「未儲存」→ 按「儲存」(或 Cmd+S)→ 變「儲存中…」→「已儲存」→ DB 確認內容已存。破壞性測試用臨時筆記,測完刪。

## 檔案

- 新增 `client/src/lib/noteDirty.ts` + `noteDirty.test.ts`(`isNoteDirty`)。
- 改 `client/src/components/notes/NoteEditorModal.tsx`(儲存鈕、狀態指示、Cmd+S、共用 `saveNow`)。
