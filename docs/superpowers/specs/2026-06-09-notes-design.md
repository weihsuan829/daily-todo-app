# 筆記(Notes)功能 — 設計規格

日期:2026-06-09

## 目標

在 daily-todo-app 加入一個**卡片式、可搜尋的筆記功能**,讓使用者記錄專案上零碎、容易忘記的小事;支援圖文混排(可貼上截圖)、標籤、顏色、釘選、關聯專案,以及卡片牆拖曳排序。

## 使用情境

「專案上很多小事情,每次都很容易忘記」→ 快速記下來、貼上截圖佐證、之後用搜尋/標籤找回來。

---

## A. 位置與導覽

- 側邊欄 **Category 區新增「Notes」**項目(圖示 `StickyNote`),點了導向 `/notes`。
- `/notes` 是獨立路由(在 `App.tsx` 加 `<Route path="/notes" component={Notes} />`),頁面元件 `client/src/pages/Notes.tsx`。
- 理由:筆記內容多、需要自己的版面,不適合塞進週曆那種 in-place 切換。

## B. 版面:卡片牆 + 編輯視窗

- `/notes` 頁頂部工具列:**搜尋框** + **標籤篩選 chips** + **「+ 新增筆記」**按鈕。
- 卡片牆:**響應式格狀排列**(CSS grid,`repeat(auto-fill, minmax(240px, 1fr))`),每張卡一格、可拖曳。
  - 註:不採用純瀑布流(CSS columns),因為瀑布流與順暢的拖曳排序互斥;格狀排列才能用 @dnd-kit 順暢拖曳。
- **卡片(唯讀預覽)** 內容:釘選圖示(右上)、左側顏色條、粗體標題、內文前數行純文字預覽、若內容含圖片顯示第一張縮圖、底部標籤 chips + 關聯專案小標 + 更新時間。
- **點卡片 → 開編輯視窗(置中 modal)**:標題欄、圖文內容編輯器、顏色、標籤、關聯專案、釘選切換、刪除(含確認)。即時存檔(debounce / blur)。
  - 採置中 modal(非右側抽屜),因為圖文內容需要較寬的編輯畫布(Google Keep 風)。

## C. 內容編輯器(圖文混排)

- 使用 **tiptap**(`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`)。
- 支援基本格式:粗體、標題、項目清單/編號清單。
- **貼上截圖**:監聽編輯器 paste 事件,偵測剪貼簿圖片 → 透過通用圖片上傳端點上傳到 `uploads/` → 取得 URL → 以 `<img src>` 內嵌到游標位置。
- 內容以 **HTML 字串**存進 `notes.content`;圖片只存連結,不存進資料庫。

## D. 資料模型

新增 `notes` 表(只新增,不動現有表):

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | int PK autoincrement | |
| userId | int notNull | 擁有者 |
| title | varchar(255) notNull | 標題(可為空字串) |
| content | text | tiptap HTML |
| color | varchar(20) | 卡片顏色(可空) |
| isPinned | boolean default false notNull | 釘選 |
| projectId | int (nullable) | 關聯專案(可空) |
| tags | text | JSON 字串陣列,如 `["購料","會議"]` |
| order | int default 0 notNull | 拖曳排序索引 |
| createdAt | timestamp defaultNow | |
| updatedAt | timestamp defaultNow onUpdateNow | |

- 用 `pnpm db:push` 產生並套用 migration。
- CRUD 全部以 `userId` 綁定(`where eq(notes.userId, userId)`),與現有慣例一致。
- **標籤**:為求精簡,存成筆記上的 JSON 字串陣列,不另開 join 表;前端篩選列由所有筆記的標籤去重產生。
  - 取捨:沿用現有 `tags`/`taskTags` 表較一致,但會把任務標籤與筆記標籤耦合、且需要標籤管理 UI;筆記標籤獨立、簡單版即可滿足「快速貼標 + 篩選」。

## E. 後端 API(`notes` router,鏡像 `projects` router 寫法)

`server/routers.ts` 新增 `notes` router;`server/db.ts` 新增對應函式:

- `list(input?: { search?, tag?, projectId? })` → `listNotes(userId, opts)`:回傳該使用者筆記,排序 **釘選優先 → updatedAt desc**。
- `create({ title, content?, color?, projectId?, tags? })` → `createNote(...)`:`order` 設為目前最大值 +1。
- `update({ id, ...fields })` → `updateNote(userId, id, partial)`:更新並 `updatedAt = now`。
- `reorder({ orderedIds: number[] })` → `reorderNotes(userId, orderedIds)`:依陣列索引設 `order`(鏡像現有 `reorderProjectTasks`)。
- `delete({ id })` → `deleteNote(userId, id)`。

通用圖片上傳:現有附件上傳端點是綁任務的;新增/調整一個**不綁任務的圖片上傳端點**(multer → `uploads/` → 回 `{ url }`)供筆記編輯器使用。

## F. 搜尋與篩選

- **搜尋**:比對 標題 + 內文純文字(內文先去除 HTML 標籤再比對);圖片不可搜。
- **標籤篩選**:點工具列標籤 chip → 只顯示含該標籤的筆記。
- MVP 先做**前端即時篩選**(載入全部筆記後在前端過濾;筆記量不大);日後若量大再搬到後端 `LIKE` 查詢。

## G. 拖曳排序

- 用專案已有的 **@dnd-kit**(core/sortable),`rectSortingStrategy`。
- 拖曳放開 → 呼叫 `notes.reorder({ orderedIds })` 持久化。
- 釘選筆記與一般筆記分區拖曳(釘選區、一般區各自排序),避免拖曳跨越釘選狀態造成混淆。

## H. 不在範圍(YAGNI)

多人共享、版本歷史、Markdown/匯出、圖片 OCR 搜尋、巢狀資料夾、提醒通知。

## I. 風險 / 注意

- 新增相依套件:tiptap 三個套件(前端)。
- 新 DB 表 + migration(只新增,不動現有表/資料)。
- 需新增「通用圖片上傳」端點。
- 置中 modal 編輯器需處理 tiptap 在 modal 內的焦點/貼上行為。

## J. 驗證方式

- **後端 CRUD 走 TDD**:純函式(如 HTML→純文字、搜尋比對、reorder 索引計算)寫單元測;`listNotes` 排序/擁有權邏輯測試。
- **前端**:`pnpm check` typecheck;dev 實機測:新增筆記、貼截圖內嵌、搜尋、標籤篩選、釘選排序、顏色、關聯專案跳轉、拖曳排序持久化。
- **不碰使用者現有資料**;破壞性測試一律用臨時筆記,測完刪除。

## K. 檔案結構(預計)

- `drizzle/schema.ts` — 新增 `notes` 表 + `Note` 型別
- `server/db.ts` — `listNotes / createNote / updateNote / reorderNotes / deleteNote`
- `server/routers.ts` — `notes` router
- `server/_core/uploads.ts`(或新檔)— 通用圖片上傳端點
- `client/src/pages/Notes.tsx` — 筆記頁(工具列 + 卡片牆 + DnD)
- `client/src/components/notes/NoteCard.tsx` — 卡片(預覽 + sortable)
- `client/src/components/notes/NoteEditorModal.tsx` — 置中編輯 modal
- `client/src/components/notes/NoteEditor.tsx` — tiptap 編輯器(含貼圖上傳)
- `client/src/lib/noteText.ts` — HTML→純文字、搜尋比對(純函式,可測)
- `client/src/App.tsx` — 加 `/notes` 路由
- 側邊欄元件 — 加「Notes」入口
