# Round 5 — TaskDetailDrawer (full: + color, description, subtasks, attachments, comments)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, frequent commits. DB live :3307. Verify via /api/dev-login + Playwright.

**Goal:** Clicking a task (in any project view) opens a PMS-style detail drawer to edit: title, 狀態(status), 優先級(priority), 開始日/截止日(start/due), 顏色(color), 標籤(tags), 說明(description), 子任務(subtasks), **附件(attachments: upload + list + download + image/PDF inline preview)**, **留言(comments: list + add + delete)**.

**Scope notes / deferrals:**
- Attachments use **local-disk upload** (multer → `uploads/`, served via express static) — works locally without S3.
- **Office (.docx/.xlsx/.pptx) preview via LibreOffice is OUT** this round (needs LibreOffice install; the v16 spec). Inline preview now = images + PDF; other types = download link.
- Description = plain **textarea** this round (tiptap rich-text deferred).
- Reference: `/Users/weihsuan/claude-agent/Project_management_system/frontend/src/components/TaskDetailDrawer.tsx` + `AttachmentPreview.tsx`; backend `Project_management_system/backend/app/routers/{attachments,comments}.py`.

---

## Task 1 — schema: task color + attachments + comments
**File:** `drizzle/schema.ts`
- [ ] Add to `tasks`: `color: varchar("color", { length: 20 })` (nullable).
- [ ] New tables:
```ts
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Attachment = typeof attachments.$inferSelect;
export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Comment = typeof comments.$inferSelect;
```
- [ ] `pnpm check`; generate+migrate (`DATABASE_URL=mysql://daily:daily_dev@127.0.0.1:3307/daily_todo`). Commit.

## Task 2 — db.ts: attachments + comments + color passthrough
**File:** `server/db.ts`
- [ ] `listAttachments(userId, taskId)`, `createAttachment(userId, {taskId,fileUrl,fileName,fileSize})`, `deleteAttachment(userId, id)` (return the row so the route can unlink the file). `listComments(userId, taskId)` (join users for author name), `createComment(userId, taskId, content)`, `deleteComment(userId, id)`. Null-safe pattern. (Ownership: task belongs to the user — reuse a simple `eq(tasks.userId, userId)` check or fetch the task.)
- [ ] `color` passes through `updateTask` already (just add to router input next task). `pnpm check`. Commit.

## Task 3 — backend: upload route + static + multer
**Files:** `package.json` (+multer, +@types/multer), `server/_core/uploads.ts` (new), `server/_core/index.ts`, `.gitignore`
- [ ] `pnpm add multer && pnpm add -D @types/multer`.
- [ ] `server/_core/uploads.ts`: `registerUploadRoutes(app)`:
  - `POST /api/tasks/:taskId/attachments` (multer single-file `file`, dest `uploads/`, limit 50MB) → authenticate via `sdk.authenticateRequest(req)`; save with a uuid/nanoid filename keeping the extension; insert attachment row via db; return the row. 
  - `DELETE /api/attachments/:id` → authenticate; db.deleteAttachment → `fs.unlink` the file; return ok.
  - serve `app.use("/uploads", express.static(uploadsDir))`.
- [ ] In `server/_core/index.ts` register these BEFORE the vite catch-all (next to registerOAuthRoutes). Create `uploads/` dir on boot. Add `uploads/` to `.gitignore`.
- [ ] `pnpm check`. Commit.

## Task 4 — routers: attachments.list/delete, comments.*, tasks color (TDD)
**Files:** `server/routers.ts`; test `server/drawer.test.ts`
- [ ] `tasks.update` & `create` inputs: add `color: z.string().max(20).nullable().optional()` (pass through).
- [ ] `attachments` router: `list({taskId})`→listAttachments, `delete({id})`→deleteAttachment (note: actual upload is the express route, not tRPC). `comments` router: `list({taskId})`, `create({taskId, content})` (content min 1), `delete({id})`.
- [ ] Test (shape): `attachments.list` array; `comments.list` array; `comments.create` rejects empty; `tasks.update` accepts `color`. Green + `pnpm check`; full `pnpm test` only 4 pre-existing failures. Commit.

## Task 5 — TaskDetailDrawer component
**Files:** create `client/src/components/project/TaskDetailDrawer.tsx`
**Reference:** PMS `TaskDetailDrawer.tsx` (port layout/sections, daily tokens). Props `{ task: Task; projectId: number; allTasks: Task[]; tagsById; tagIdsByTask; onClose: () => void }`.
- [ ] A right-side slide-in panel (fixed, overlay) like the screenshot. Header: `任務 #<id>`, delete (trash) + close (X). Body sections:
  - Title (large, editable on click/blur → `tasks.update({id,title})`).
  - 狀態 select (todo/in_progress/done/archived) + 優先級 select or PriorityPicker (low/medium/high/urgent).
  - 開始日 / 截止日 (`<input type="date">` → `tasks.update`).
  - 顏色: a color swatch + hex (small palette / native color input) → `tasks.update({id,color})`.
  - 標籤: reuse TagChips + TagPicker.
  - 說明: textarea bound to `description` → `tasks.update({id,description})` on blur.
  - 子任務: list this task's children (from `allTasks.filter(t=>t.parentTaskId===task.id)`) with completion toggle + an "新增子任務" input (`tasks.create({title, parentTaskId:task.id, projectId, status:'todo', category:null})`).
  - 附件: upload button (posts multipart to `/api/tasks/<id>/attachments` via `fetch`/axios `FormData`), list attachments (`trpc.attachments.list`), each with download link + delete; inline preview for images (`<img>`) and PDF (`<iframe>`); other types → download only. Invalidate `attachments.list` on change.
  - 留言: list (`trpc.comments.list`) with author + time; an input to add (`trpc.comments.create`); delete own.
  - Delete task (trash icon) → `tasks.delete({id})` → onClose + invalidate listByProject.
- [ ] `pnpm check`. Commit.

## Task 6 — open drawer on task click across views
**Files:** `client/src/pages/ProjectView.tsx` (host the drawer + `selectedTaskId` state), `ProjectListView.tsx`, `ProjectKanbanView.tsx`, `ProjectCalendarView.tsx`, `ProjectGanttView.tsx`
- [ ] Hoist `selectedTaskId` to `ProjectView`; pass an `onOpenTask(id)` callback to each view; render `<TaskDetailDrawer>` in ProjectView when a task is selected (resolve task from the unfiltered `tasks`). 
- [ ] List: clicking a row (not on an interactive control) → `onOpenTask(task.id)`. Kanban: clicking a card (not on picker/drag) → open. Calendar: clicking a bar → open. Gantt: clicking a row/bar → open. Keep drag/pickers working (stop propagation on controls).
- [ ] `pnpm check`; browser (dev-login): click a task in each view → drawer opens; edit fields, add subtask, upload an attachment (image → inline preview), add a comment; delete works. Drive Playwright. Commit.

---

## Final checklist
- [ ] `pnpm check` clean; `pnpm test` only 4 pre-existing failures.
- [ ] Browser: drawer opens from all 4 views; all fields editable; attachment upload + image/PDF preview + download + delete; comments add/list/delete; subtasks add/toggle; task delete.
- [ ] Existing views/filters/subtasks/tags/bulk still work.
