# PMS Parity Round 2 — Subtasks + Tags + Filter/Sort/Bulk

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, frequent commits.

**Goal:** Bring the original PMS project features the Phase-1 "lite" port omitted, scoped to what's meaningful for a single user: (1) parent/child **subtasks** with expand/collapse, inline add, and parent date aggregation; (2) **tags**; (3) a **filter/sort toolbar + bulk operations**. Assignee, comments, attachments, realtime are explicitly OUT (need the multi-user/Phase 2-4 backend).

**Base:** daily-todo-app (already has the Phase-1 Projects feature: workspaces/projects, tasks with projectId/status/startDate, four views ported from PMS, dev-login, docker MySQL on :3307).

**Reference app (read source when porting):** `/Users/weihsuan/claude-agent/Project_management_system/frontend/`

## PMS → daily-todo adaptation rules (apply to every port)
- axios → tRPC (`trpc.X.useMutation/useQuery`, `utils.tasks.listByProject.invalidate({projectId})` on success).
- Field names: `parent_task_id`→`parentTaskId`, `start_date`→`startDate`, `due_date`→`dueDate`, `tag_ids`→`tagIds`, `position`→`order`.
- Dates: PMS uses `YYYY-MM-DD` strings; daily uses JS `Date`. Convert with `date-fns` where comparing.
- Statuses: `todo | in_progress | done` only (NO `archived`).
- DROP everything assignee-related (`assignee_id`, AssigneePicker, assignee filters, assigneeQuick, "only me").
- Restyle blue → daily tokens (`bg-card/bg-muted/bg-primary/border-border/text-foreground/text-muted-foreground/focus:ring-ring`); NO raw `blue-*`/`#3b82f6`.
- Verification in this environment = `pnpm check` + scoped `pnpm vitest run <file>` + browser via dev-login. DB is live (docker MySQL on :3307), so e2e works.

---

## Task 1: Schema — parentTaskId + tags + taskTags

**Files:** Modify `drizzle/schema.ts`

- [ ] Add `parentTaskId: int("parentTaskId"),` to the `tasks` table (after `projectId`).
- [ ] Append two tables:
```ts
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).default("#94a3b8").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const taskTags = mysqlTable("task_tags", {
  taskId: int("taskId").notNull(),
  tagId: int("tagId").notNull(),
});
export type TaskTag = typeof taskTags.$inferSelect;
```
- [ ] `pnpm check` clean.
- [ ] Generate migration: `DATABASE_URL="mysql://daily:daily_dev@127.0.0.1:3307/daily_todo" pnpm exec drizzle-kit generate`. Then apply: `DATABASE_URL=... pnpm exec drizzle-kit migrate` (DB is live).
- [ ] Commit.

## Task 2: db.ts — subtask/tags/bulk functions

**Files:** Modify `server/db.ts`. Follow the getDb()-null-safe pattern.

- [ ] Add (import `tags, taskTags, Tag` from schema):
```ts
export async function listTags(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  return db.select().from(tags).where(eq(tags.projectId, projectId));
}
export async function createTag(userId: number, projectId: number, name: string, color?: string) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.insert(tags).values({ projectId, name, color });
}
export async function deleteTag(userId: number, tagId: number) {
  const db = await getDb(); if (!db) return null;
  await db.delete(taskTags).where(eq(taskTags.tagId, tagId));
  return db.delete(tags).where(eq(tags.id, tagId));
}
export async function setTaskTags(userId: number, taskId: number, tagIds: number[]) {
  const db = await getDb(); if (!db) return null;
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  if (tagIds.length) await db.insert(taskTags).values(tagIds.map((tagId) => ({ taskId, tagId })));
  return { success: true };
}
export async function listTaskTags(userId: number, projectId: number) {
  // returns [{taskId, tagId}] for all tasks in the project (frontend builds the map)
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  const rows = await db.select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
    .from(taskTags).innerJoin(tasks, eq(taskTags.taskId, tasks.id))
    .where(eq(tasks.projectId, projectId));
  return rows;
}
export async function bulkUpdateTasks(userId: number, ids: number[], changes: { status?: "todo"|"in_progress"|"done"; priority?: "low"|"medium"|"high" }) {
  const db = await getDb(); if (!db) return null;
  const synced = applyStatusCompletionSync(changes);
  for (const id of ids) {
    await db.update(tasks).set({ ...synced, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
  return { success: true };
}
export async function bulkDeleteTasks(userId: number, ids: number[]) {
  const db = await getDb(); if (!db) return null;
  for (const id of ids) {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
  return { success: true };
}
```
- [ ] `pnpm check` clean. Commit.

## Task 3: routers — parentTaskId + tags + bulk (TDD)

**Files:** Modify `server/routers.ts`; Test `server/pmsParity.test.ts`

- [ ] Test (shape/availability, DB-tolerant): `tags.list` returns array; `tags.create` rejects empty name; `tasks.bulkUpdate`/`tasks.bulkDelete`/`tasks.setTags`/`tags.taskMap` defined; `tasks.create` accepts `parentTaskId`.
- [ ] Implement:
  - `tasks.create` input: add `parentTaskId: z.number().optional()`, pass to createTask.
  - new `tags` router: `list({projectId})`, `create({projectId,name,color?})` (name min 1), `delete({id})`, `taskMap({projectId})`→listTaskTags.
  - `tasks.setTags({ id, tagIds })`→setTaskTags; `tasks.bulkUpdate({ ids, status?, priority? })`→bulkUpdateTasks; `tasks.bulkDelete({ ids })`→bulkDeleteTasks.
- [ ] `pnpm vitest run server/pmsParity.test.ts` green; `pnpm check` clean; full `pnpm test` shows only the 4 pre-existing DB failures. Commit.

## Task 4: List view — subtasks (parent/child)

**Files:** Modify `client/src/components/project/ProjectListView.tsx`; create `client/src/lib/taskHierarchy.ts`
**Reference:** PMS `src/lib/taskHierarchy.ts` (port `buildTaskTree`/`getEffectiveDates`, adapting field names + `Date` types), and PMS `ProjectView.tsx` `StatusSection`/`SortableTaskRow` subtask rendering (expand/collapse chevron, indented subtask rows, inline "+subtask", `InlineNewSubtaskRow`).

- [ ] Port `taskHierarchy.ts` to `client/src/lib/taskHierarchy.ts` adapted to daily `Task` (camelCase, `startDate`/`dueDate` as `Date|null`, `parentTaskId`). Keep `buildTaskTree`, `getEffectiveDates`, `countSubtasks`.
- [ ] In List view: within each status section, render root tasks (parentTaskId==null); under each parent show its subtasks (indented) with an expand/collapse chevron (collapsed state in localStorage like PMS). Add a hover "+subtask" that opens an inline row → `tasks.create({ title, projectId, parentTaskId: parent.id, status: parent.status, category: null })`. Parent whose children have dates shows aggregated dates (read-only) via `getEffectiveDates`.
- [ ] `pnpm check` clean. Browser verify: add subtask under a task, expand/collapse works, parent date reflects children. Commit.

## Task 5: Tags UI

**Files:** create `client/src/components/project/TagChips.tsx`, `client/src/components/project/TagPicker.tsx`; modify `ProjectListView.tsx`
**Reference:** PMS `src/components/TagChips.tsx`.

- [ ] `TagChips`: render a task's tags as small colored chips (port from PMS, daily tokens). Props: `tagIds: number[]`, `tagsById: Record<number, Tag>`.
- [ ] `TagPicker`: popover to toggle tags on a task + create a new tag (`tags.create`, `tasks.setTags`). 
- [ ] In ProjectView, fetch `tags.list({projectId})` + `tags.taskMap({projectId})`, build `tagsById` and `tagIdsByTask`, pass into List rows. Show TagChips per row + a way to open TagPicker.
- [ ] `pnpm check` clean. Browser verify: create tag, attach to task, chip shows. Commit.

## Task 6: Filter/Sort toolbar + Bulk bar

**Files:** create `client/src/lib/filterSort.ts`, `client/src/components/project/ProjectToolbar.tsx`; modify `ProjectListView.tsx` (+ ProjectView to host toolbar state)
**Reference:** PMS `src/lib/filterSort.ts` + `src/components/ProjectToolbar.tsx` + the bulk bar in `ProjectView.tsx` (lines ~753-799).

- [ ] Port `filterSort.ts` adapted: SortField `manual|priority|due_date|created_at|title`; filters = priority + tag + due (NO assignee, NO assigneeQuick); `closed` toggle hides `done`; statuses `todo|in_progress|done`; use `order` for manual sort and `Date` for due/created comparisons; `tagIds` from the task-tag map (pass a `tagIdsOf(task)` accessor since daily tasks don't carry tagIds inline).
- [ ] Port `ProjectToolbar` (filter + sort controls, daily tokens) into the List view header area. Persist filter state in localStorage per project (like PMS).
- [ ] Bulk: multi-select checkboxes on rows + a floating bar (port PMS bulk bar) with change-status / change-priority / delete → `tasks.bulkUpdate` / `tasks.bulkDelete`.
- [ ] `pnpm check` clean. Browser verify: filter by priority/tag, sort, multi-select + bulk status change + bulk delete. Commit.

---

## Final checklist
- [ ] `pnpm test` — new pmsParity + existing project/taskStatus/cookies/const tests green; only the 4 pre-existing DB-dependent failures remain.
- [ ] `pnpm check` clean.
- [ ] Browser e2e (dev-login): subtasks nest + aggregate dates; tags create/attach/filter; toolbar filter/sort; bulk update/delete.
- [ ] daily-todo's existing daily/weekly/recurring/annual/eisenhower views still work.
