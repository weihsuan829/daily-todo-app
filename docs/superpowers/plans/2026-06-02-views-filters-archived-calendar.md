# Round 4 — Shared filters across views, Archived status, PMS Calendar bars

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, frequent commits. DB live on :3307; verify via /api/dev-login + Playwright.

**Goals:**
1. Kanban / Calendar / Gantt get the **same filter/sort toolbar** as List (hoist filter state to `ProjectView`; toolbar shown for all views; filtered tasks fed to every view).
2. Add an **`archived`** status (4th status): schema enum, sync helper, statusMeta, filterSort closed-logic, a collapsible **ARCHIVED column** in Kanban, and an Archived section in List (shown via the "closed" toggle).
3. **Calendar = PMS**: multi-day spanning **bars** with interactions — double-click an empty day to add, drag a bar to move both dates, drag a bar's left/right edge to adjust start/end — plus the hint row "雙擊空白日期新增 ・ 拖橫條移動 ・ 拖左右邊調整起訖".

**Adaptation rules:** axios→tRPC; camelCase; statuses now `todo|in_progress|done|archived`; daily tokens; `getEffectiveDates` for parent aggregation; only ROOT tasks on Calendar/Gantt/Kanban cards (subtasks via hover/list). Reference: `/Users/weihsuan/claude-agent/Project_management_system/frontend/src/`.

---

## Task 1 — Archived status: schema + sync helper (TDD)
**Files:** `drizzle/schema.ts`, `server/taskStatus.ts`, `server/taskStatus.test.ts`
- [ ] `tasks.status` enum → `["todo","in_progress","done","archived"]`.
- [ ] `TaskStatus` type in `server/taskStatus.ts` → add `"archived"`. `applyStatusCompletionSync`: only `done` sets `completed=true`+completedAt; `todo|in_progress|archived` set `completed=false`+completedAt null. Add a test: `status:"archived"` → completed false.
- [ ] `pnpm vitest run server/taskStatus.test.ts` green; `pnpm check`; generate+migrate (`DATABASE_URL=mysql://daily:daily_dev@127.0.0.1:3307/daily_todo`). Commit.

## Task 2 — statusMeta + filterSort for archived (TDD)
**Files:** `client/src/lib/statusMeta.ts`, `client/src/lib/filterSort.ts`, `client/src/lib/filterSort.test.ts` (new, optional but preferred)
- [ ] `statusMeta.ts`: `TaskStatus` add `"archived"`; `STATUS_META.archived = { label:"ARCHIVED", icon: Archive (lucide), color:"#94a3b8", filled:false }`; `STATUS_ORDER = ["todo","in_progress","done","archived"]`.
- [ ] `filterSort.ts`: `CLOSED_STATUSES = ["done","archived"]`; `visibleStatuses(state)` → all 4 when `closed` true, else hide done+archived; priority rank unchanged. Ensure `passesFilters` hides closed statuses when `closed=false`.
- [ ] `pnpm check`. Commit.

## Task 3 — Hoist filter state + toolbar to ProjectView
**Files:** `client/src/pages/ProjectView.tsx`, `client/src/components/project/ProjectListView.tsx`
- [ ] Move OUT of `ProjectListView` and INTO `ProjectView`: the `filterState` (+ localStorage `projectFilter_<id>`), `auth.me` (currentUserId), `tags.list`+`tags.taskMap` (build `tagsById`,`tagIdsByTask`), and `<ProjectToolbar>`. Render the toolbar in `ProjectView` directly under the header (visible for ALL views).
- [ ] In `ProjectView`, compute `const filtered = applyFilterSort(rootAndSubtasks, filterState, { currentUserId, tagIdsOf })`. NOTE: filtering should keep subtasks whose parent passes (so List nesting still works) — simplest: filter ROOT tasks via applyFilterSort, then re-include any subtask whose parent survived. Provide both `filteredTasks` and the raw `tasks` to views as needed.
- [ ] Pass to each view: `tasks={filteredTasks}`, `filterState`, `tagsById`, `tagIdsByTask`. `ProjectListView` becomes a pure consumer: it no longer renders its own toolbar or owns filterState; it uses `filterState` for `visibleStatuses` (section list incl. archived when closed) and `sort.field !== "manual"` → `dragDisabled`. Keep subtasks/tags/bulk/pickers working.
- [ ] `pnpm check`; browser: toolbar appears above every view; filtering on List still works. Commit.

## Task 4 — Kanban: consume filtered tasks + ARCHIVED column
**File:** `client/src/components/project/ProjectKanbanView.tsx`
- [ ] Accept `filterState` prop; render columns = `STATUS_ORDER` (now incl. archived) — but use `visibleStatuses(filterState)` so archived only shows when the "closed" toggle is on (matching List). Render the ARCHIVED column collapsible (collapsed by default), like the earlier screenshot. Cards already root-only + hover (keep).
- [ ] Tasks come pre-filtered from ProjectView (root cards = filteredTasks roots). Drag to archived column → `setStatus({status:"archived"})`.
- [ ] `pnpm check`; browser verify ARCHIVED column + filter applies. Commit.

## Task 5 — Calendar: PMS spanning bars + interactions
**File:** `client/src/components/project/ProjectCalendarView.tsx`
**REFERENCE (read fully): `/Users/weihsuan/claude-agent/Project_management_system/frontend/src/components/CalendarView.tsx`** — port its month-grid bar layout (multi-day bars positioned across week rows, lane stacking to avoid overlap, bar continues across week boundaries), the priority flag on the bar, and the three interactions:
  - **double-click an empty day cell** → create a task on that day (`tasks.create({ title:"New task", startDate, dueDate: sameDay, projectId, category:null, status:"todo" })`, or open an inline title prompt like PMS).
  - **drag a bar** (body) → move both startDate & dueDate by the day delta → `tasks.update({ id, startDate, dueDate })`.
  - **drag the left edge** → change startDate; **drag the right edge** → change dueDate → `tasks.update`.
- [ ] Show ROOT tasks only; a task spans `getEffectiveDates(task, subtasksOf)` (parents use aggregated span). Bar color from task priority or a per-task hue (match PMS). Add the hint row at top-right: "雙擊空白日期新增 ・ 拖橫條移動 ・ 拖左右邊調整起訖". Consume the pre-filtered `tasks`. Daily tokens.
- [ ] `pnpm check`; browser verify against the screenshot: bars span correctly across weeks, double-click adds, drag moves, edge-drag resizes. Drive Playwright. Commit.

## Task 6 — Gantt: consume filtered tasks
**File:** `client/src/components/project/ProjectGanttView.tsx`
- [ ] Ensure it renders the pre-filtered `tasks` (root tasks) and respects filterState (it receives filteredTasks from ProjectView). Minimal change if it already takes `tasks`. `pnpm check`; browser verify filter applies. Commit.

---

## Final checklist
- [ ] `pnpm check` clean; `pnpm test` only the 4 pre-existing DB failures.
- [ ] Browser: toolbar+filter works on List/Kanban/Calendar/Gantt; ARCHIVED column in Kanban (+ archived hides under "closed" toggle); Calendar bars span + double-click add + drag move + edge resize; subtasks/tags/bulk/pickers/hover intact.
