# PMS Full-Fidelity Round 3 — Pickers, Assignee, Row Layout, Filter (1:1)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, frequent commits.

**Goal:** Make the daily-todo project List row + pickers + filter **identical to the original PMS** (per user screenshots): rich **DatePicker** (Start/Due tabs, presets, range, Set Recurring, Clear), **PriorityPicker** (Urgent/High/Normal/Low flags + Clear, 4 levels), **AssigneePicker** (Me + guest/placeholder members, "search or add guest"), the exact row layout (drag · circle · title · assignee · date-range · flag · multi-select · +subtask · edit), and PMS's filter logic exactly (incl. assignee filter).

**Base:** daily-todo-app Projects feature already has: projects, tasks(projectId/status/startDate/parentTaskId), four views, subtasks, tags, basic toolbar+bulk. This round upgrades fidelity and adds assignee + 4th priority + task recurrence.

## Adaptation rules (every port)
- axios→tRPC; invalidate `tasks.listByProject`/relevant queries on success.
- Fields camelCase: `assignee_id`→`assigneeId`, `assignee_placeholder_id`→`assigneePlaceholderId`, `recurrence_rule`→`recurrenceRule`, `start_date`→`startDate`, `due_date`→`dueDate`, `parent_task_id`→`parentTaskId`, `position`→`order`. PMS dates are `YYYY-MM-DD` strings; daily uses JS `Date` — convert with `date-fns`.
- Statuses todo/in_progress/done (no archived).
- Restyle blue→daily tokens; KEEP the PMS layout/spacing/flow identical otherwise.
- Verify: `pnpm check` + scoped `pnpm vitest run` + browser via /api/dev-login (DB live on :3307).

## Reference (read at execution): `/Users/weihsuan/claude-agent/Project_management_system/frontend/src/`
- `components/PriorityPicker.tsx`, `components/DatePicker.tsx`, `components/AssigneePicker.tsx`, `components/Avatar.tsx`
- `pages/ProjectView.tsx` (SortableTaskRow column order/layout), `lib/filterSort.ts`, `components/ProjectToolbar.tsx`
- `api.ts` (PRIORITY_LABELS, TaskPriority, types)

---

## Task 1 — Schema: priority+urgent, assignee, placeholder_members, recurrenceRule
**File:** `drizzle/schema.ts`
- [ ] `tasks.priority` enum → add `"urgent"`: `mysqlEnum("priority", ["low","medium","high","urgent"]).default("medium").notNull()`.
- [ ] Add to `tasks`: `assigneeId: int("assigneeId")`, `assigneePlaceholderId: int("assigneePlaceholderId")`, `recurrenceRule: text("recurrenceRule")`.
- [ ] New table:
```ts
export const placeholderMembers = mysqlTable("placeholder_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PlaceholderMember = typeof placeholderMembers.$inferSelect;
export type InsertPlaceholderMember = typeof placeholderMembers.$inferInsert;
```
- [ ] `pnpm check`; generate+migrate with `DATABASE_URL="mysql://daily:daily_dev@127.0.0.1:3307/daily_todo"`. Commit.

## Task 2 — db.ts: members + placeholders + assignee/recurrence passthrough
**File:** `server/db.ts`
- [ ] `listWorkspaceMembers(userId, projectId)`: return the workspace's real members resolved to users — for now `[{ id: userId, name, email, kind: "user" }]` (the owner = "Me"). (Look up the project's workspace owner; return that user.)
- [ ] Placeholder CRUD (scoped to the project's workspace via `userOwnsProject`): `listPlaceholders(userId, projectId)`, `createPlaceholder(userId, projectId, name, color?)`, `deletePlaceholder(userId, id)`.
- [ ] `updateTask` already spreads updates → assigneeId/assigneePlaceholderId/recurrenceRule pass through once added to the router input. Add a note: setting assigneeId clears assigneePlaceholderId and vice-versa (enforce in the router or a small helper).
- [ ] `pnpm check`. Commit.

## Task 3 — routers: members/placeholders + task fields (TDD)
**File:** `server/routers.ts`; test `server/fidelity.test.ts`
- [ ] `tasks.update` & `tasks.create` inputs: add `assigneeId: z.number().nullable().optional()`, `assigneePlaceholderId: z.number().nullable().optional()`, `recurrenceRule: z.string().nullable().optional()`, and widen priority enums to include `"urgent"`. In the handler, if `assigneeId` set → force `assigneePlaceholderId: null` (and vice versa).
- [ ] New `members` router: `list({projectId})`→listWorkspaceMembers. New `placeholders` router: `list({projectId})`, `create({projectId,name,color?})` (name min1), `delete({id})`.
- [ ] Test (shape): members.list array; placeholders.list array; placeholders.create rejects empty; tasks.update accepts priority "urgent". Green + `pnpm check`; full `pnpm test` only 4 pre-existing failures. Commit.

## Task 4 — PriorityPicker (1:1)
**Files:** create `client/src/components/project/PriorityPicker.tsx`; modify `ProjectListView.tsx`
- [ ] Port PMS `PriorityPicker.tsx` + `PriorityFlag` exactly: 4 levels Urgent(red)/High(orange)/Normal(blue=medium)/Low(gray) with flag icons + a "Clear" row. Labels map: low→Low, medium→Normal, high→High, urgent→Urgent. Popover on a flag trigger. `onChange(priority|null)` → `tasks.update({id, priority})`.
- [ ] Replace the `<select>` priority control in the row with this picker. `pnpm check`; browser verify flags match screenshot. Commit.

## Task 5 — DatePicker (1:1)
**Files:** create `client/src/components/project/DatePicker.tsx`; modify `ProjectListView.tsx`
- [ ] Port PMS `DatePicker.tsx` exactly: Start/Due tabs, preset list (Today/Tomorrow/This weekend/Next week/Next weekend/2 weeks/4 weeks), month calendar with range highlight (start→due), footer showing `YYYY-MM-DD → YYYY-MM-DD`, "Set Recurring" (sets `recurrenceRule` JSON like PMS `{freq, interval}`), "Clear Due date". Trigger shows `M/D → M/D` range like screenshot. Convert PMS string dates ↔ daily `Date`.
- [ ] Wire: `tasks.update({ id, startDate, dueDate, recurrenceRule })`. Replace the native date input in the row. `pnpm check`; browser verify against screenshot (presets, range, recurring, clear). Commit.

## Task 6 — AssigneePicker (1:1)
**Files:** create `client/src/components/project/AssigneePicker.tsx`, `client/src/components/project/Avatar.tsx`; modify `ProjectListView.tsx`
- [ ] Port PMS `AssigneePicker.tsx` + `Avatar`: trigger = avatar (or dashed "add" icon when unassigned); popover with a search box ("搜尋或輸入新訪客名稱"), a MEMBERS section (from `members.list` — "Me"), placeholder members (from `placeholders.list`), and typing a new name offers "add as guest" → `placeholders.create` then assign. Selecting a member → `tasks.update({ id, assigneeId })`; selecting a placeholder → `tasks.update({ id, assigneePlaceholderId })` (router clears the other). Avatar shows initial + color.
- [ ] Add the assignee control to the row in PMS's column position. `pnpm check`; browser verify (assign Me, add a guest, avatar shows). Commit.

## Task 7 — Row layout 1:1
**File:** `client/src/components/project/ProjectListView.tsx`
- [ ] Match PMS `SortableTaskRow` column order/spacing exactly: drag handle · completion circle · title (+chevron/↳ for subtasks, +tag chips) · **AssigneePicker** · **DatePicker (range trigger)** · **PriorityPicker (flag)** · hover actions (multi-select checkbox · + subtask · edit pencil). Keep subtasks/tags/bulk/DnD working. Use the date-range trigger label `M/D → M/D` (or single date) like the screenshots; aggregated (read-only) for parents with dated children.
- [ ] `pnpm check`; browser verify the row matches the screenshot layout. Commit.

## Task 8 — Filter logic 1:1
**Files:** `client/src/lib/filterSort.ts`, `client/src/components/project/ProjectToolbar.tsx`
- [ ] Re-port PMS `filterSort.ts` to match exactly, ADD BACK what was trimmed: assignee filter condition + `assigneeQuick` ("all"/"me"/{ids}) + the "only me" quick toggle; due before/after/between; priority incl. urgent; tag filter (via tagIdsOf accessor); `closed` toggle; statuses todo/in_progress/done. Manual sort uses `order`.
- [ ] Update `ProjectToolbar` to include the assignee quick filter + full filter UI like PMS. `pnpm check`; browser verify filter parity. Commit.

---

## Final checklist
- [ ] `pnpm check` clean; `pnpm test` only the 4 pre-existing DB failures.
- [ ] Browser (dev-login) parity vs screenshots: priority flags (4+clear), date picker (tabs/presets/range/recurring/clear), assignee (me+guest), exact row layout, filter incl. assignee.
- [ ] Subtasks/tags/bulk/DnD + existing daily views still work.
