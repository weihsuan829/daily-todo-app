# Phase 1 設計:在 daily-todo 加入「專案」(個人專案 + 團隊就緒)

> **主題**:把 Project_management_system 的「專案管理」能力,搬移整併進 daily-todo-app。
> 以 daily-todo(TypeScript 全棧:Express + tRPC + Drizzle + MySQL)為主系統,
> PMS(Python/FastAPI)僅作為搬移邏輯的參考來源,不會被修改。
>
> **定位**:現在個人使用,但資料模型預留「未來拉人進來」的空間(零資料遷移即可變團隊)。
>
> **日期**:2026-06-01
>
> **狀態**:設計草稿,待 user review
>
> **整體藍圖**:此為四階段整併的 Phase 1。Phase 2-4(附件+Office預覽 / 任務留言 / Realtime+Search)
> 先擱置,待 Phase 1 落地後各自開設計。

---

## 0. 背景與決策紀錄

兩個系統的現況:

| | Project_management_system (PMS) | daily-todo-app |
|---|---|---|
| 定位 | 仿 ClickUp 的團隊協作工具 | 個人生產力工具 |
| 後端 | Python / FastAPI | TypeScript / Express + tRPC |
| 資料庫 | PostgreSQL | MySQL |
| 資料模型 | workspace → project(可巢狀) → task | 平的 tasks(綁 userId、category、dueDate) |

**已確認的決策**(來自 brainstorming):

1. **整合策略**:功能搬移整併成「一個乾淨系統」(一個 DB、一個登入、資料互通),而非外殼 iframe。
2. **主系統**:daily-todo 當底,把 PMS 的專案能力重做進來。理由:daily-todo 更成熟、功能豐富、單一語言好維護;PMS 的專案後端相對標準,重做成本低於反向。
3. **真正目標**:管理「我自己的專案」。現在個人用,但**以後可能拉人進來**,所以資料模型要留位置。
4. **資料模型方向**:Approach B —— 引入極簡 workspace 當「留位置」,個人用時 workspace 隱形;未來拉人是純加法、零資料遷移。
5. **檢視方式**:一個專案要能用**多種 view** 看進度(使用者重視「不同觀點」)。
6. **前端要跟 PMS 一致**:專案管理的版面/互動(view 切換、依狀態分組清單、拖拉、看板、行事曆、甘特圖)照 PMS 的 `ProjectView` 重現,**但套用 daily-todo 的米灰配色**(Tailwind v4 + shadcn token)。因此 Phase 1 的四個 view 改為對齊 PMS:**清單 List / 看板 Kanban / 行事曆 Calendar / 甘特圖 Gantt**(取代先前的 Dashboard)。
7. **一致程度:版面一致、功能精簡**。版面、拖拉、狀態分組、view 切換照 PMS;保留優先級(daily 本來就有)。**暫不移植**團隊/未做後端才有的小工具:assignee 指派、tags、子任務、批次操作、篩選排序 toolbar、即時同步。等 Phase 2-4 後端補上再長回去。

**為支援 PMS 對齊新增的最小後端**:
- task 狀態值改為 `todo / in_progress / done`(對齊 PMS,`archived` 先不做)。
- task 加 `startDate`(起始日),配合 `dueDate` 形成日期區間 —— 甘特圖與 PMS 日期顯示需要。
- 加 `tasks.reorder`(依排序後的 id 陣列存 `order`)—— 清單/看板拖拉排序需要。
- 前端加 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities` 相依(PMS 拖拉用)。

**YAGNI 否決的項目**(現在不做):成員權限 UI、即時協作(Realtime)、全文搜尋、任務留言 UI(daily-todo 已有「任務筆記」)、附件、巢狀子專案、tags、assignee/placeholder、子任務、批次操作、篩選排序 toolbar、`archived` 狀態。

---

## 1. 範圍

### 要做的

- 新增資料表:`workspaces`、`workspaceMembers`、`projects`。
- 擴充 `tasks`:加 `projectId`(可空)、`status`(todo/doing/done)。
- Migration:建表 + 為每個現有 user 自動建立預設 workspace;舊任務不受影響。
- 後端:`projects.*` tRPC router、擴充 `tasks.*`、`completed ↔ status` 同步邏輯。
- 前端:側邊欄「Projects」區(專案清單 + 新增);專案詳情頁含四個可切換 view。
- 測試(TDD):資料模型、CRUD、同步鐵則、舊每日檢視不被破壞。

### 不做的(Phase 1 範圍外)

- 成員邀請 / 角色權限的 UI 與後端授權判斷(只先預留資料表)。
- Realtime 即時同步、全文搜尋。
- 任務留言、附件、Office 預覽(分別是 Phase 2/3)。
- 巢狀子專案、tags、任務指派(assignee)。
- workspace 切換 UI(個人用隱形,未來再做)。

---

## 2. 資料模型

### 2.1 新增表(Drizzle / MySQL,沿用 camelCase 慣例)

```ts
// workspaces:團隊空間。個人用時每人一個預設空間。
export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// workspaceMembers:為未來拉人預留。個人用時只有一筆(owner 自己)。
export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("owner").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

// projects:任務的歸屬容器。
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6").notNull(),
  description: text("description"),
  archived: boolean("archived").default(false).notNull(),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
```

### 2.2 修改 `tasks`

```ts
// 既有欄位不動,新增三欄:
projectId: int("projectId"),                                  // 可空:沒專案的舊/每日任務照常
status: mysqlEnum("status", ["todo", "in_progress", "done"])  // 對齊 PMS(archived 先不做)
          .default("todo").notNull(),
startDate: timestamp("startDate"),                            // 可空:配合 dueDate 形成區間(甘特圖用)
// 既有 category 由 NOT NULL 改為可空(專案任務可不歸 work/life):
category: mysqlEnum("category", ["work", "life", "eisenhower"]),  // 改為 nullable
```

> **為何 category 改可空**:讓專案任務可以不屬於 work/life。但若專案任務也設了 category + dueDate,
> 它仍會照常出現在對應的每日檢視分頁——這就是「一筆任務、多種觀點」。

### 2.3 索引

- `tasks.projectId`、`projects.workspaceId`、`workspaceMembers.workspaceId`、`workspaceMembers.userId` 加索引。

---

## 3. `completed` 與 `status` 的同步鐵則(核心不變式)

daily-todo 的每日/每週檢視全靠 `tasks.completed` 布林值,絕不能破壞。因此定義不變式:

> **`status === 'done'` ⟺ `completed === true`**

實作規則(集中在 `server/db.ts` 的 update 路徑,單一事實來源):

| 觸發 | 動作 |
|---|---|
| 每日檢視打勾完成(設 `completed = true`) | 同時設 `status = 'done'`、`completedAt = now` |
| 每日檢視取消完成(設 `completed = false`) | 若原本 `status === 'done'` → 退回 `status = 'todo'`;`completedAt = null` |
| 看板拖到 `done` 欄(設 `status = 'done'`) | 同時設 `completed = true`、`completedAt = now` |
| 看板拖到 `todo`/`in_progress` 欄 | 設 `completed = false`、`completedAt = null` |

> 實作上提供一個共用 helper(例如 `applyStatusCompletionSync(updates)`),所有改 `completed` 或 `status`
> 的路徑都先過它,確保兩欄一致。狀態值為 `todo / in_progress / done`;測試覆蓋四個方向。

---

## 4. 後端(server)

### 4.1 Workspace 啟用(bootstrap)

- 新增 `ensureDefaultWorkspace(userId)`:查無該 user 的 workspace 時,建立一個 `name = "My Workspace"`、
  `ownerId = userId`,並插入一筆 `workspaceMembers(role = 'owner')`。
- 呼叫時機:使用者登入(`upsertUser`)後,或第一次呼叫 `projects.list` 時 lazy 建立。
- Migration 階段對所有現有 user 批次補建(見 §6)。

### 4.2 `projects` tRPC router(`server/routers.ts`)

| Procedure | 輸入 | 行為 |
|---|---|---|
| `projects.list` | — | 回傳當前 user 預設 workspace 下、未封存的專案(依 order)。 |
| `projects.create` | `{ name, color?, description? }` | 在預設 workspace 建專案;order 取 max+1。 |
| `projects.update` | `{ id, name?, color?, description? }` | 改專案。需驗證屬於該 user 的 workspace。 |
| `projects.archive` | `{ id, archived }` | 封存/取消封存(軟刪除,不真的刪任務)。 |
| `projects.reorder` | `{ id, direction }` 或 `{ orderedIds }` | 調整側邊欄排序。 |

授權:Phase 1 用「workspace 必須屬於當前 user(owner)」即可;未來加成員時再擴成 membership 檢查。

### 4.3 `tasks` router 擴充

- 既有 `tasks.create/update/delete/list` 等加上對 `projectId`、`status`、`startDate` 的支援。
- 新增 `tasks.listByProject({ projectId })`:回傳該專案所有任務(供四個 view 共用)。
- 新增 `tasks.setStatus({ id, status })`:看板拖拉用;內部走 §3 同步 helper。
- 新增 `tasks.reorder({ projectId, orderedIds })`:依拖拉後的 id 陣列重設 `order`(對齊 PMS 的 `/tasks/reorder`)。
- 既有「上下移動 order」邏輯沿用。

### 4.4 `server/db.ts` 新增查詢函式

- `ensureDefaultWorkspace`、`getDefaultWorkspace(userId)`
- `listProjects` / `createProject` / `updateProject` / `archiveProject` / `reorderProject`
- `listTasksByProject(userId, projectId)`
- 修改既有 task update 路徑,套用 §3 同步 helper。

---

## 5. 前端(client,wouter 路由)

### 5.1 路由(`client/src/App.tsx`)

```tsx
<Route path={"/projects"} component={Projects} />        // 專案清單(或併入側邊欄)
<Route path={"/projects/:id"} component={ProjectDetail} /> // 專案詳情(四 view)
```

### 5.2 側邊欄

- 在現有側邊欄(`TaskList` 的左欄)新增「Projects」區:列出 `projects.list`、＋ 新增專案、點擊進 `/projects/:id`。

### 5.3 專案詳情頁 `ProjectView`(移植自 PMS)

**做法:移植 PMS 的 `frontend/src/pages/ProjectView.tsx` 結構與互動到 daily-todo,改用 tRPC + wouter,套 daily 米灰配色,並拿掉精簡掉的功能。** 參考來源檔(實作時閱讀):

- `Project_management_system/frontend/src/pages/ProjectView.tsx`(主畫面:header + view 切換 + 依狀態分組清單 + 拖拉)
- `.../components/KanbanView.tsx`、`CalendarView.tsx`、`GanttView.tsx`
- `.../lib/statusMeta.ts`(狀態 pill 樣式)、`lib/filterSort.ts`(只取分組/排序的最小部分)

頂部 header:專案色點 + 名稱 + 右側 view 切換(清單/看板/行事曆/甘特圖,沿用 PMS 的 `bg-gray-100 rounded-lg` 分段按鈕但換成 daily token)。view 狀態存 `localStorage`(同 PMS)。四個 view 共用 `tasks.listByProject`:

| View | 來源元件 | 保留 | 精簡掉 |
|---|---|---|---|
| **清單 List** | ProjectView 的 `StatusSection`/`FlatList` | 依狀態分組、`@dnd-kit` 拖拉排序、跨段拖拉改狀態、完成圈、優先級 picker、起訖日 picker、inline 新增、雙擊改名 | assignee 欄、TagChips、子任務列、批次選取 bar、來源 badge |
| **看板 Kanban** | `KanbanView.tsx` | `todo/in_progress/done` 三欄、卡片拖拉換欄(改 status)、欄內排序、inline 新增 | assignee、tags、子任務計數 badge |
| **行事曆 Calendar** | `CalendarView.tsx` | 月曆格、任務依 `startDate`/`dueDate` 落格、點擊開任務 | assignee、tags |
| **甘特圖 Gantt** | `GanttView.tsx` | 依 `startDate`→`dueDate` 畫橫條、拖拉調日期 | 子任務彙整、assignee |

**配色映射(套 daily 皮)**:PMS 的藍色 accent → daily token。
`blue-50/blue-300/blue-500/blue-700`、`#3b82f6`、`#93c5fd` → `bg-primary` / `bg-accent` / `ring-ring` / `border-border` / `text-muted-foreground`;
卡片底 `bg-white` → `bg-card`;頁面底 `bg-gray-50` → `bg-background`;一般文字灰 → `text-foreground`/`text-muted-foreground`。狀態 pill 顏色(`statusMeta`)可保留語意色但調柔。

> 不移植 `TaskDetailDrawer` 的完整版(它依賴留言/附件/assignee);Phase 1 點任務先用 daily 既有的 `TaskNotesModal`(編輯標題/優先級/筆記),或一個精簡 drawer。

### 5.4 與既有每日檢視的整合

- 既有每日/每週檢視查詢**不改邏輯**:有 `dueDate` 的任務照常出現,不論有沒有 `projectId`。
- 任務卡片(`InteractiveTaskCard`)可選擇性顯示所屬專案的小色塊/名稱(nice-to-have,非必要)。

### 5.5 相依套件

- 新增 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`(PMS 拖拉用;daily 目前未裝)。
- 圖示沿用 `lucide-react`(兩邊都有)。

---

## 6. Migration

1. Drizzle 產生 migration:建立 `workspaces`、`workspace_members`、`projects` 三張表;
   `tasks` 加 `projectId`、`status`,並將 `category` 改為 nullable。
2. 資料補建腳本(migration 或一次性 script):
   - 對每個現有 `users` 列,若無 workspace → 建預設 workspace + owner membership。
   - 既有 tasks:`projectId` 留 NULL、`status` 依 `completed` 回填(`completed ? 'done' : 'todo'`)。
3. 用 `pnpm db:push`(`drizzle-kit generate && drizzle-kit migrate`)套用。
4. **回滾**:保留 migration 的 down 或記錄手動回復步驟(刪新表、移除新欄)。

---

## 7. 測試(TDD,先紅後綠)

放在 `server/*.test.ts`(沿用 vitest):

1. **Workspace bootstrap**:新 user 第一次 → 自動建預設 workspace + owner membership;重複呼叫不重建。
2. **Projects CRUD**:create/list/update/archive/reorder;封存的不出現在 list;跨 user 不可存取他人專案。
3. **Task ↔ Project**:建立帶 `projectId` 的任務;`listTasksByProject` 只回該專案任務。
4. **同步鐵則(四方向)**:
   - 設 `completed=true` → `status='done'`;
   - 設 `completed=false`(原 done)→ `status='todo'`;
   - `setStatus('done')` → `completed=true`;
   - `setStatus('todo'/'in_progress')` → `completed=false`。
5. **回歸保護**:有 `dueDate` 的專案任務仍出現在既有每日檢視查詢;舊的(無 projectId)任務行為不變。

---

## 8. 實作順序(Phase 1 內部分段,每段可獨立驗證)

| 段 | 內容 | 驗證點 |
|---|---|---|
| 1 | 資料模型(status=todo/in_progress/done、startDate)+ migration + 預設 workspace + `completed↔status` 同步 helper(含測試)| 測試綠燈;migration 套用成功;舊任務 status 正確回填。 |
| 2 | `projects.*` router + `tasks` 擴充(projectId/status/startDate/listByProject/setStatus/reorder)+ 裝 `@dnd-kit` | router 測試綠燈。 |
| 3 | 側邊欄 Projects + 專案頁外殼(view 切換)+ **清單 List**(移植 PMS StatusSection,套 daily 皮)| 能建專案、歸任務、依狀態分組、拖拉排序/改狀態。 |
| 4 | **看板 Kanban**(移植 KanbanView)| 卡片拖拉換欄,completed 同步。 |
| 5 | **行事曆 Calendar**(移植 CalendarView)| 任務依 startDate/dueDate 落格。 |
| 6 | **甘特圖 Gantt**(移植 GanttView)| 依 startDate→dueDate 畫橫條、拖拉調日期。 |

每段結束跑 `pnpm test` + `pnpm check`,並實際跑起來看(verification-before-completion)。

---

## 9. 邊界情況

| 情境 | 處理 |
|---|---|
| 刪除/封存專案 | Phase 1 用封存(軟刪);其底下任務 `projectId` 是否保留待定 → 預設保留任務、僅專案標 archived。 |
| 任務同時有 projectId + category + dueDate | 三種觀點都看得到(專案四 view + work/life 每日檢視),符合設計意圖。 |
| 專案任務無 dueDate | 不出現在每日檢視,只在專案 view 內。 |
| 既有 recurring/annual/eisenhower 功能 | 完全不動;它們不綁 projectId。 |
| 未來拉人 | 加 `workspaceMembers` 列 + 邀請 UI + 把授權從「owner」放寬到「membership」;現有資料零遷移。 |
| daily-todo-app 資料夾權限 `drwx------` | owner 可讀寫;若 migration/寫入遇權限問題,回報 user。 |

---

## 10. 待 user 確認

1. 整份設計 OK 嗎?
2. 封存專案時,底下任務的 `projectId` 要**保留**(任務還在,只是專案隱藏)還是**清空**?(建議保留)
3. 四個 view 的實作順序(§8)OK 嗎?還是想先做某個 view?
