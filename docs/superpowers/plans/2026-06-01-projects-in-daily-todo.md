# Projects in daily-todo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Projects" capability to daily-todo-app so a user can group tasks under projects and manage each project through four views — **List / Kanban / Calendar / Gantt** — whose layout and interactions mirror Project_management_system (PMS), restyled to daily-todo's muted-gray theme. A workspace layer is pre-built so multi-user can be added later with zero data migration.

**Architecture:** daily-todo-app is the base (Express + tRPC + Drizzle + MySQL + React 19/wouter + Tailwind v4/shadcn tokens). We add three tables (`workspaces`, `workspace_members`, `projects`) and three columns on `tasks` (`projectId`, `status`, `startDate`). A pure sync helper keeps `tasks.completed` and `tasks.status` consistent so existing daily/weekly views never break. The four project views are **ported from PMS's `ProjectView.tsx` + KanbanView/CalendarView/GanttView**, rewired from axios→tRPC, restyled blue→daily tokens, with team-only widgets (assignee, tags, subtasks, bulk, filter toolbar, realtime) omitted in Phase 1.

**Tech Stack:** TypeScript, Drizzle ORM (mysql-core), tRPC v11, Zod, React 19, wouter, @tanstack/react-query, @dnd-kit (new), lucide-react, date-fns, vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-projects-in-daily-todo-design.md`

---

## Conventions

- DB columns are camelCase (match existing `drizzle/schema.ts`).
- tRPC procedures follow the existing pattern in `server/routers.ts` (`protectedProcedure.input(z.object({...})).query|mutation(async ({ ctx, input }) => …)`, `ctx.user.id` = current user).
- db functions in `server/db.ts` tolerate a missing DB (`getDb()` may be `null`) returning safe defaults — match existing functions.
- Router/db tests assert shape/availability (CI has no DB); pure-function tests assert real behavior. Put real logic in pure functions.
- Task status set is `todo | in_progress | done` (PMS-aligned; `archived` deferred).

## PMS → daily-todo porting rules (referenced by all frontend port tasks)

When a task says "port PMS component X", read the PMS source file, reproduce its **structure, layout, and interactions**, and apply ALL of these transformations:

1. **Data layer: axios → tRPC.** Replace PMS's `api.get/post/patch` calls:
   - `api.get('/api/projects/:id/tasks')` → the `tasks` prop passed in from `tasks.listByProject.useQuery({ projectId })`.
   - `api.patch('/api/tasks/:id', changes)` → `trpc.tasks.update.useMutation()` → `update.mutate({ id, ...changes })`.
   - `api.post('/api/projects/:id/tasks', payload)` → `trpc.tasks.create.useMutation()` → `create.mutate({ ...payload, projectId, category: null })`.
   - status change → `trpc.tasks.setStatus.useMutation()` (`{ id, status }`).
   - reorder → `trpc.tasks.reorder.useMutation()` (`{ projectId, orderedIds }`).
   - After every mutation `onSuccess`, call `utils.tasks.listByProject.invalidate({ projectId })`.
2. **Routing: react-router-dom → wouter.** `useParams` → `useRoute("/projects/:id")`; `<Link to=…>` → wouter `<Link href=…>`.
3. **Omit deferred widgets.** Remove all JSX/props for: `AssigneePicker`/assignee column, `TagChips`/tags, subtask rows + `parent_task_id` logic, bulk-select bar, `ProjectToolbar`/filter-sort, realtime (`onRealtimeEvent`), `TaskDetailDrawer` (use daily's `TaskNotesModal` on row click instead), source badges, sub-projects (`parent_project_id`, `include_subprojects`, `onlyThisLayer`).
4. **Keep:** view switcher, status grouping, `@dnd-kit` drag reorder + cross-status drag, completion circle, `PriorityPicker` (daily has `priority: low|medium|high`), date picker for `startDate`/`dueDate`, inline "Add Task", double-click rename, localStorage view persistence.
5. **Field name mapping** (PMS snake_case → daily camelCase): `due_date`→`dueDate`, `start_date`→`startDate`, `project_id`→`projectId`. PMS dates are `YYYY-MM-DD` strings; daily uses JS `Date` (timestamp) — convert with `date-fns` (`format`, `parseISO`).
6. **Restyle blue → daily tokens** (Tailwind v4 + shadcn). Apply these replacements:
   - active/accent `bg-blue-*`, `#3b82f6`, `text-blue-700`, `bg-blue-50` → `bg-primary text-primary-foreground` (active) / `bg-accent` / `text-muted-foreground`.
   - focus ring `focus:ring-[#93c5fd]`, `border-blue-300` → `focus:ring-ring`, `border-border`.
   - card `bg-white` → `bg-card`; page `bg-gray-50` → `bg-background`; `border-gray-200/100` → `border-border`; body text `text-gray-800/600` → `text-foreground` / `text-muted-foreground`.
   - status pill semantic colors (statusMeta) may stay but muted.
7. **Status set:** PMS `todo/in_progress/done/archived` → use `todo/in_progress/done` (drop `archived` everywhere, including `STATUS_OPTIONS` and `visibleStatuses`).

---

## File Structure

**Created (backend):** `server/taskStatus.ts`, `server/taskStatus.test.ts`, `server/projects.test.ts`, `drizzle/backfill-projects.ts`.
**Created (frontend):** `client/src/pages/Projects.tsx`, `client/src/pages/ProjectView.tsx`, `client/src/lib/statusMeta.ts`, `client/src/components/project/{ProjectListView,ProjectKanbanView,ProjectCalendarView,ProjectGanttView,ProjectSidebarSection}.tsx`.
**Modified:** `drizzle/schema.ts`, `server/db.ts`, `server/routers.ts`, `client/src/App.tsx`, `client/src/pages/TaskList.tsx`, `package.json` (+@dnd-kit).

---

## Task 0: Initialize git

- [ ] **Step 1:** Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && git rev-parse --is-inside-work-tree 2>/dev/null || echo "no repo"` → Expected `no repo`.
- [ ] **Step 2:** Run:
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git init && git add -A && git commit -m "chore: baseline before Projects feature"
```
(If the user prefers no git, skip this and ignore later "Commit" steps.)

---

# Segment 1 — Data model + backend

## Task 1: Pure completed↔status sync helper (TDD)

**Files:** Create `server/taskStatus.ts`; Test `server/taskStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/taskStatus.test.ts
import { describe, expect, it } from "vitest";
import { applyStatusCompletionSync } from "./taskStatus";

describe("applyStatusCompletionSync", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("completed=true forces status=done + completedAt", () => {
    const o = applyStatusCompletionSync({ completed: true }, { now });
    expect(o.status).toBe("done"); expect(o.completed).toBe(true); expect(o.completedAt).toEqual(now);
  });
  it("completed=false resets status=todo + clears completedAt", () => {
    const o = applyStatusCompletionSync({ completed: false });
    expect(o.status).toBe("todo"); expect(o.completed).toBe(false); expect(o.completedAt).toBeNull();
  });
  it("status=done forces completed=true + completedAt", () => {
    const o = applyStatusCompletionSync({ status: "done" }, { now });
    expect(o.completed).toBe(true); expect(o.completedAt).toEqual(now);
  });
  it("status=in_progress forces completed=false + clears completedAt", () => {
    const o = applyStatusCompletionSync({ status: "in_progress" });
    expect(o.completed).toBe(false); expect(o.status).toBe("in_progress"); expect(o.completedAt).toBeNull();
  });
  it("passes through unrelated fields", () => {
    const o = applyStatusCompletionSync({ title: "x" });
    expect(o.title).toBe("x"); expect(o.status).toBeUndefined(); expect(o.completed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm vitest run server/taskStatus.test.ts` → Expected FAIL (`Cannot find module './taskStatus'`).

- [ ] **Step 3: Implement**

```ts
// server/taskStatus.ts
export type TaskStatus = "todo" | "in_progress" | "done";

export interface StatusSyncInput {
  completed?: boolean;
  status?: TaskStatus;
  completedAt?: Date | null;
  [key: string]: unknown;
}

/**
 * Enforces: status === "done" <=> completed === true.
 * Apply to every task-update payload that may touch `completed` or `status`.
 * `completed` (if present) drives status; else `status` drives completed.
 */
export function applyStatusCompletionSync<T extends StatusSyncInput>(
  updates: T,
  options: { now?: Date } = {},
): T {
  const out = { ...updates };
  const now = options.now ?? new Date();
  if (out.completed !== undefined) {
    out.status = out.completed ? "done" : "todo";
    out.completedAt = out.completed ? now : null;
  } else if (out.status !== undefined) {
    const done = out.status === "done";
    out.completed = done;
    out.completedAt = done ? now : null;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm vitest run server/taskStatus.test.ts` → Expected PASS (5).

- [ ] **Step 5: Commit**

```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add server/taskStatus.ts server/taskStatus.test.ts
git commit -m "feat: completed<->status sync helper (todo/in_progress/done)"
```

---

## Task 2: Schema — new tables + task columns

**Files:** Modify `drizzle/schema.ts`

- [ ] **Step 1: Append the three tables** (after the `tasks` block):

```ts
export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("owner").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

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
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
```

- [ ] **Step 2: Extend `tasks`**

In the existing `tasks` definition:
1. Make `category` nullable — replace `category: mysqlEnum("category", ["work", "life", "eisenhower"]).notNull(),` with `category: mysqlEnum("category", ["work", "life", "eisenhower"]),`
2. Add after `quadrant`:
```ts
  projectId: int("projectId"),
  status: mysqlEnum("status", ["todo", "in_progress", "done"]).default("todo").notNull(),
  startDate: timestamp("startDate"),
```

- [ ] **Step 3: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → Expected PASS. `Task` type now has `projectId: number | null`, `status: "todo"|"in_progress"|"done"`, `startDate: Date | null`.

- [ ] **Step 4: Generate migration** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm exec drizzle-kit generate` → Expected: new SQL file creating 3 tables + altering `tasks` (add projectId/status/startDate, modify category nullable). Inspect it.

- [ ] **Step 5: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add drizzle/
git commit -m "feat: workspace/project schema + task projectId/status/startDate"
```

---

## Task 3: Backfill script (default workspace + status from completed)

**Files:** Create `drizzle/backfill-projects.ts`

- [ ] **Step 1: Write the script**

```ts
// drizzle/backfill-projects.ts — run AFTER `drizzle-kit migrate`. Idempotent.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users, workspaces, workspaceMembers, tasks } from "./schema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const db = drizzle(process.env.DATABASE_URL);
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    const ws = await db.select().from(workspaces).where(eq(workspaces.ownerId, u.id)).limit(1);
    if (ws.length > 0) continue;
    await db.insert(workspaces).values({ name: "My Workspace", ownerId: u.id });
    const created = await db.select().from(workspaces).where(eq(workspaces.ownerId, u.id)).limit(1);
    await db.insert(workspaceMembers).values({ workspaceId: created[0].id, userId: u.id, role: "owner" });
  }
  await db.update(tasks).set({ status: "done" }).where(eq(tasks.completed, true));
  await db.update(tasks).set({ status: "todo" }).where(eq(tasks.completed, false));
  console.log(`Backfill complete: ${allUsers.length} users.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Apply (requires DB)** — Run:
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
pnpm exec drizzle-kit migrate && pnpm exec tsx drizzle/backfill-projects.ts
```
Expected: `Backfill complete: N users.` (If no local `DATABASE_URL`, defer this step to the DB environment; it does not block code tasks.)

- [ ] **Step 3: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add drizzle/backfill-projects.ts
git commit -m "feat: default-workspace + status backfill script"
```

---

## Task 4: db.ts — workspace bootstrap, projects CRUD, project-task queries, sync wiring

**Files:** Modify `server/db.ts`

- [ ] **Step 1: Imports** — extend the schema import to include `workspaces, workspaceMembers, projects, Project`; add `import { applyStatusCompletionSync } from "./taskStatus";`

- [ ] **Step 2: Append functions**

```ts
// ---- Workspaces ----
export async function ensureDefaultWorkspace(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (existing.length > 0) return existing[0].id;
  await db.insert(workspaces).values({ name: "My Workspace", ownerId: userId });
  const ws = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (ws.length === 0) return null;
  await db.insert(workspaceMembers).values({ workspaceId: ws[0].id, userId, role: "owner" });
  return ws[0].id;
}

// ---- Projects ----
export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const wsId = await ensureDefaultWorkspace(userId);
  if (!wsId) return [];
  return db.select().from(projects)
    .where(and(eq(projects.workspaceId, wsId), eq(projects.archived, false)))
    .orderBy(asc(projects.order));
}

export async function createProject(userId: number, name: string, color?: string, description?: string) {
  const db = await getDb();
  if (!db) return null;
  const wsId = await ensureDefaultWorkspace(userId);
  if (!wsId) return null;
  const existing = await db.select().from(projects).where(eq(projects.workspaceId, wsId));
  const order = existing.length > 0 ? Math.max(...existing.map((p) => p.order)) + 1 : 0;
  return db.insert(projects).values({ workspaceId: wsId, name, color, description, order });
}

async function userOwnsProject(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, projectId: number) {
  const rows = await db.select().from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .where(and(eq(projects.id, projectId), eq(workspaces.ownerId, userId))).limit(1);
  return rows.length > 0;
}

export async function updateProject(userId: number, projectId: number, updates: Partial<Pick<Project, "name" | "color" | "description" | "order">>) {
  const db = await getDb();
  if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.update(projects).set({ ...updates, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function archiveProject(userId: number, projectId: number, archived: boolean) {
  const db = await getDb();
  if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.update(projects).set({ archived, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function listTasksByProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  return db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)))
    .orderBy(asc(tasks.order), desc(tasks.createdAt));
}

export async function reorderProjectTasks(userId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) return null;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(tasks).set({ order: i })
      .where(and(eq(tasks.id, orderedIds[i]), eq(tasks.userId, userId)));
  }
  return { success: true };
}
```

- [ ] **Step 3: Wire the sync helper into `updateTask`** — replace its `.set({ ...updates, updatedAt: new Date() })` with:
```ts
    const synced = applyStatusCompletionSync(updates);
    const result = await db
      .update(tasks)
      .set({ ...synced, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
```

- [ ] **Step 4: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → Expected PASS.

- [ ] **Step 5: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add server/db.ts
git commit -m "feat: workspace bootstrap, projects CRUD, project task queries, status sync"
```

---

## Task 5: tRPC routers — projects + tasks extensions (TDD)

**Files:** Modify `server/routers.ts`; Test `server/projects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/projects.test.ts
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function ctx(): TrpcContext {
  const user: User = { id: 1, openId: "t", email: "t@e.com", name: "T", loginMethod: "manus",
    role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("projects router", () => {
  it("projects.list returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).projects.list())).toBe(true);
  });
  it("projects.create rejects empty name", async () => {
    await expect(appRouter.createCaller(ctx()).projects.create({ name: "" })).rejects.toThrow();
  });
  it("tasks.setStatus validates the enum", async () => {
    const c = appRouter.createCaller(ctx());
    expect(c.tasks.setStatus).toBeDefined();
    // @ts-expect-error invalid status
    await expect(c.tasks.setStatus({ id: 1, status: "nope" })).rejects.toThrow();
  });
  it("tasks.listByProject returns an array", async () => {
    expect(Array.isArray(await appRouter.createCaller(ctx()).tasks.listByProject({ projectId: 1 }))).toBe(true);
  });
  it("tasks.reorder accepts an id list", async () => {
    expect(appRouter.createCaller(ctx()).tasks.reorder).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm vitest run server/projects.test.ts` → Expected FAIL (procedures missing).

- [ ] **Step 3: Implement**

1. Extend the `./db` import with: `listProjects, createProject, updateProject, archiveProject, listTasksByProject, reorderProjectTasks`.
2. Add the `projects` router (after the `tasks` router):
```ts
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => listProjects(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100), color: z.string().max(20).optional(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createProject(ctx.user.id, input.name, input.color, input.description)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(100).optional(), color: z.string().max(20).optional(), description: z.string().optional(), order: z.number().optional() }))
      .mutation(async ({ ctx, input }) => { const { id, ...u } = input; return updateProject(ctx.user.id, id, u); }),
    archive: protectedProcedure
      .input(z.object({ id: z.number(), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => archiveProject(ctx.user.id, input.id, input.archived)),
  }),
```
3. In `tasks.create` input, add `projectId: z.number().optional(),`, `status: z.enum(["todo","in_progress","done"]).optional(),`, `startDate: z.date().optional(),` and pass them into the `createTask({...})` call (`projectId: input.projectId, status: input.status, startDate: input.startDate`).
4. In `tasks.update` input, add `projectId: z.number().nullable().optional(),`, `status: z.enum(["todo","in_progress","done"]).optional(),`, `startDate: z.date().nullable().optional(),`.
5. Add to the `tasks` router:
```ts
    listByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listTasksByProject(ctx.user.id, input.projectId)),
    setStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["todo", "in_progress", "done"]) }))
      .mutation(async ({ ctx, input }) => updateTask(input.id, ctx.user.id, { status: input.status })),
    reorder: protectedProcedure
      .input(z.object({ projectId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => reorderProjectTasks(ctx.user.id, input.orderedIds)),
```
> `updateTask` routes through `applyStatusCompletionSync` (Task 4), so `setStatus` keeps `completed` consistent automatically.

- [ ] **Step 4: Run test + typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm vitest run server/projects.test.ts && pnpm check` → Expected PASS (5) + no type errors.

- [ ] **Step 5: Full regression** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm test` → Expected: existing suites still PASS.

- [ ] **Step 6: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add server/routers.ts server/projects.test.ts
git commit -m "feat: projects router + task projectId/status/startDate/listByProject/setStatus/reorder"
```

---

## Task 6: Install @dnd-kit

**Files:** Modify `package.json` (+ lockfile)

- [ ] **Step 1: Install** — Run:
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
pnpm add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```
Expected: three packages added to `dependencies`.

- [ ] **Step 2: Verify build still typechecks** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → Expected PASS.

- [ ] **Step 3: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add package.json pnpm-lock.yaml
git commit -m "chore: add @dnd-kit for project drag-and-drop"
```

---

# Segment 2 — Frontend shell + sidebar

## Task 7: Routes, Projects index, ProjectView shell

**Files:** Modify `client/src/App.tsx`; Create `client/src/pages/Projects.tsx`, `client/src/pages/ProjectView.tsx`, `client/src/lib/statusMeta.ts`, and four view stubs in `client/src/components/project/`.

- [ ] **Step 1: Routes** — in `client/src/App.tsx` add imports `import Projects from "@/pages/Projects";` and `import ProjectView from "@/pages/ProjectView";`, and inside `<Switch>` before `/404`:
```tsx
      <Route path={"/projects"} component={Projects} />
      <Route path={"/projects/:id"} component={ProjectView} />
```

- [ ] **Step 2: statusMeta lib** (ported from PMS `lib/statusMeta.ts`, daily-styled, 3 statuses):
```tsx
// client/src/lib/statusMeta.ts
import { Check, Circle, CircleDashed, type LucideIcon } from "lucide-react";

export type TaskStatus = "todo" | "in_progress" | "done";

export interface StatusMeta { label: string; icon: LucideIcon; color: string; filled: boolean; }

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: { label: "TO DO", icon: CircleDashed, color: "#94a3b8", filled: false },
  in_progress: { label: "IN PROGRESS", icon: Circle, color: "#9ca3af", filled: true },
  done: { label: "DONE", icon: Check, color: "#10b981", filled: true },
};
export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export function statusPillClass(status: TaskStatus): { className: string; style: React.CSSProperties } {
  const meta = STATUS_META[status];
  const className = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide";
  return meta.filled
    ? { className, style: { backgroundColor: meta.color, color: "#fff" } }
    : { className, style: { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" } };
}
```

- [ ] **Step 3: Projects index page**
```tsx
// client/src/pages/Projects.tsx
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const create = trpc.projects.create.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const [name, setName] = useState("");
  return (
    <div className="max-w-2xl mx-auto p-6 text-foreground">
      <h1 className="text-2xl font-bold mb-4">Projects</h1>
      <form className="flex gap-2 mb-6" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { create.mutate({ name: name.trim() }); setName(""); } }}>
        <input className="flex-1 border border-border bg-input rounded px-3 py-2" placeholder="New project name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="px-4 py-2 rounded bg-primary text-primary-foreground" type="submit" disabled={create.isPending}>+ Add</button>
      </form>
      {isLoading ? <p>Loading…</p> : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex items-center gap-2 p-3 rounded border border-border bg-card hover:bg-accent">
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />{p.name}
              </Link>
            </li>
          ))}
          {projects.length === 0 && <p className="text-muted-foreground">No projects yet.</p>}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: ProjectView shell** with the PMS-style view switcher (List/Kanban/Calendar/Gantt). Status grouping etc. arrive in later tasks; this shell renders the switcher + delegates to view components.
```tsx
// client/src/pages/ProjectView.tsx
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { BarChart3, Calendar as CalendarIcon, Columns3, List } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ProjectListView from "@/components/project/ProjectListView";
import ProjectKanbanView from "@/components/project/ProjectKanbanView";
import ProjectCalendarView from "@/components/project/ProjectCalendarView";
import ProjectGanttView from "@/components/project/ProjectGanttView";

type ViewMode = "list" | "kanban" | "calendar" | "gantt";
const VIEW_META: Record<ViewMode, { label: string; Icon: typeof List }> = {
  list: { label: "清單", Icon: List },
  kanban: { label: "看板", Icon: Columns3 },
  calendar: { label: "行事曆", Icon: CalendarIcon },
  gantt: { label: "甘特圖", Icon: BarChart3 },
};

export default function ProjectView() {
  const [, params] = useRoute("/projects/:id");
  const projectId = Number(params?.id);
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("projectView") as ViewMode) || "list");
  useEffect(() => { localStorage.setItem("projectView", view); }, [view]);
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const project = projects.find((p) => p.id === projectId);
  const { data: tasks = [], isLoading } = trpc.tasks.listByProject.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });

  if (!project) return <div className="p-8 text-muted-foreground">找不到這個專案。</div>;
  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <header className="px-8 py-5 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-xl font-semibold">{project.name}</h1>
        </div>
        <div className="inline-flex bg-muted rounded-lg p-1 text-sm">
          {(["list","kanban","calendar","gantt"] as ViewMode[]).map((v) => {
            const { Icon, label } = VIEW_META[v]; const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition ${active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            );
          })}
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {isLoading ? <div className="p-8 text-muted-foreground text-sm">載入中…</div> : (
          <>
            {view === "list" && <ProjectListView projectId={projectId} tasks={tasks} />}
            {view === "kanban" && <ProjectKanbanView projectId={projectId} tasks={tasks} />}
            {view === "calendar" && <ProjectCalendarView projectId={projectId} tasks={tasks} />}
            {view === "gantt" && <ProjectGanttView projectId={projectId} tasks={tasks} />}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Shared props type + four stubs**
```tsx
// client/src/components/project/types.ts
import type { Task } from "../../../../drizzle/schema";
export interface ProjectViewProps { projectId: number; tasks: Task[]; }
```
Create `ProjectListView.tsx`, `ProjectKanbanView.tsx`, `ProjectCalendarView.tsx`, `ProjectGanttView.tsx`, each:
```tsx
import type { ProjectViewProps } from "./types";
export default function ProjectListView(_props: ProjectViewProps) { return <div className="p-8 text-muted-foreground">List view</div>; }
```
(Change the component name and label string per file.)

- [ ] **Step 6: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → Expected PASS.

- [ ] **Step 7: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/App.tsx client/src/pages/Projects.tsx client/src/pages/ProjectView.tsx client/src/lib/statusMeta.ts client/src/components/project/
git commit -m "feat: project routes, index page, ProjectView shell + view switcher"
```

---

## Task 8: Projects section in the sidebar

**Files:** Create `client/src/components/project/ProjectSidebarSection.tsx`; Modify `client/src/pages/TaskList.tsx`

- [ ] **Step 1: Component**
```tsx
// client/src/components/project/ProjectSidebarSection.tsx
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
export default function ProjectSidebarSection() {
  const { data: projects = [] } = trpc.projects.list.useQuery();
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Projects</span>
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">＋</Link>
      </div>
      <ul className="space-y-1">
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent text-sm">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />{p.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Mount** — in `client/src/pages/TaskList.tsx` add `import ProjectSidebarSection from "@/components/project/ProjectSidebarSection";` and render `<ProjectSidebarSection />` at the end of the left sidebar container (search for the category-tags block; place it immediately after).

- [ ] **Step 3: Typecheck + manual** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → PASS. Then `pnpm dev`: a "Projects" block appears in the sidebar; creating a project at `/projects` makes it show there and link to `/projects/:id`.

- [ ] **Step 4: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/components/project/ProjectSidebarSection.tsx client/src/pages/TaskList.tsx
git commit -m "feat: Projects section in sidebar"
```

---

# Segment 3 — List view (port PMS StatusSection/FlatList)

## Task 9: Port the List view

**Files:** Modify `client/src/components/project/ProjectListView.tsx`
**Reference (read these):** `Project_management_system/frontend/src/pages/ProjectView.tsx` (the `StatusSection`, `SortableTaskRow`, `FlatList` functions, lines ~611–684 and ~804–1392), `.../lib/statusMeta.ts`, `.../components/PriorityPicker.tsx`, `.../components/DatePicker.tsx`.

- [ ] **Step 1: Implement the List view by porting** PMS's status-grouped list. Apply ALL "PMS → daily-todo porting rules" above. Concretely:
  - Group `tasks` by `status` into `todo / in_progress / done` sections (use `STATUS_META` from `@/lib/statusMeta`). Render each as a collapsible `StatusSection` with a `@dnd-kit` `useDroppable` zone (`id={`section-${status}`}`) and `SortableContext`.
  - Each row = a ported `SortableTaskRow` using `useSortable` for drag. **Keep:** drag handle, completion circle (toggles `status` done↔todo via `setStatus`), title with double-click rename (`tasks.update` `{ title }`), `PriorityPicker` (port; maps to daily `priority: low|medium|high`), date picker (port; edits `startDate`/`dueDate` via `tasks.update`), inline "Add Task" form per section (`tasks.create` `{ title, status: sectionStatus, projectId, category: null }`). **Drop:** assignee column, TagChips, subtasks, bulk checkbox/bar, source badge, sub-project logic.
  - `onDragEnd`: if dropped on a different section → `setStatus.mutate({ id, status: targetStatus })`; if reordered within a section → compute new order and `reorder.mutate({ projectId, orderedIds })`. Mirror PMS's `onUnifiedDragEnd` (lines ~491–527) minus sub-projects.
  - Mutations from `trpc.useUtils()`; every `onSuccess` → `utils.tasks.listByProject.invalidate({ projectId })`.
  - Restyle per rule 6 (no raw blue; use tokens). Row click (not on an interactive control) → open daily's existing `TaskNotesModal` for that task (import it; it already edits title/priority/notes).

- [ ] **Step 2: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → Expected PASS.

- [ ] **Step 3: Manual verify** — `pnpm dev`: open a project → add tasks into each status section → drag a task to another section (status changes; completion circle reflects done) → drag within a section (order persists after reload) → double-click title to rename → set priority/date. Switch to List from daily view: a project task with a `dueDate` also shows in the main daily view.

- [ ] **Step 4: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/components/project/ProjectListView.tsx
git commit -m "feat: project List view (ported from PMS, daily-themed)"
```

---

# Segment 4 — Kanban view

## Task 10: Port the Kanban view

**Files:** Modify `client/src/components/project/ProjectKanbanView.tsx`
**Reference:** `Project_management_system/frontend/src/components/KanbanView.tsx`.

- [ ] **Step 1: Implement by porting** PMS's `KanbanView`, applying the porting rules:
  - Three columns `todo / in_progress / done` (drop `archived`). Each column is a `@dnd-kit` droppable; cards are `useSortable`.
  - Dragging a card to another column → `setStatus.mutate({ id, status: columnStatus })`; reordering within a column → `reorder.mutate({ projectId, orderedIds })`.
  - Card shows title + `PriorityPicker` + due date chip. **Drop** assignee/tags/subtask-count.
  - Per-column inline "Add Task" → `tasks.create({ title, status: columnStatus, projectId, category: null })`.
  - `onSuccess` → `utils.tasks.listByProject.invalidate({ projectId })`. Restyle per rule 6.

- [ ] **Step 2: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → PASS.

- [ ] **Step 3: Manual verify** — drag a card to "Done" → switch to List view → it appears under Done with its completion circle filled (invariant holds both directions). Reorder within a column persists after reload.

- [ ] **Step 4: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/components/project/ProjectKanbanView.tsx
git commit -m "feat: project Kanban view (ported from PMS)"
```

---

# Segment 5 — Calendar view

## Task 11: Port the Calendar view

**Files:** Modify `client/src/components/project/ProjectCalendarView.tsx`
**Reference:** `Project_management_system/frontend/src/components/CalendarView.tsx`.

- [ ] **Step 1: Implement by porting** PMS's `CalendarView`, applying the porting rules:
  - Month grid (use `date-fns`). Place each task on its `dueDate` (and span from `startDate`→`dueDate` if both present, like PMS). Drop assignee/tags.
  - Clicking a task → open `TaskNotesModal` (or select). Creating a task on a day cell → `tasks.create({ title, dueDate: <cellDate>, projectId, category: null, status: "todo" })`.
  - Dragging a task to another day (if PMS supports it) → `tasks.update({ id, dueDate })`. `onSuccess` → invalidate. Restyle per rule 6.

- [ ] **Step 2: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → PASS.

- [ ] **Step 3: Manual verify** — give a project task a due date → it appears on that day in Calendar view, and also in the main daily view for that date.

- [ ] **Step 4: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/components/project/ProjectCalendarView.tsx
git commit -m "feat: project Calendar view (ported from PMS)"
```

---

# Segment 6 — Gantt view

## Task 12: Port the Gantt view

**Files:** Modify `client/src/components/project/ProjectGanttView.tsx`
**Reference:** `Project_management_system/frontend/src/components/GanttView.tsx`.

- [ ] **Step 1: Implement by porting** PMS's `GanttView`, applying the porting rules:
  - Timeline rows: one bar per task from `startDate` → `dueDate`. Tasks missing one date: render per PMS's fallback (e.g., single-day bar at the known date; skip if both null with a note).
  - Drag/resize a bar to change dates → `tasks.update({ id, startDate, dueDate })`. Drop sub-task aggregation and assignee. `onSuccess` → invalidate. Restyle per rule 6.

- [ ] **Step 2: Typecheck** — Run: `cd /Users/weihsuan/claude-agent/daily-todo-app && pnpm check` → PASS.

- [ ] **Step 3: Manual verify** — set a task's start + due dates → a bar spans those dates in Gantt; dragging the bar updates the dates and they persist after reload.

- [ ] **Step 4: Commit**
```bash
cd /Users/weihsuan/claude-agent/daily-todo-app
git add client/src/components/project/ProjectGanttView.tsx
git commit -m "feat: project Gantt view (ported from PMS)"
```

---

## Final verification checklist

- [ ] `pnpm test` — all suites pass (taskStatus, projects, tasks, recurring-deletion, auth.logout).
- [ ] `pnpm check` — no type errors.
- [ ] Manual: create project → add tasks → List/Kanban/Calendar/Gantt all reflect the same tasks.
- [ ] Manual: completing in List sets it done on the Kanban; moving to Done on the Kanban checks it in List (invariant both directions).
- [ ] Manual: a project task with a due date also appears in the existing daily/weekly view.
- [ ] Manual: drag reorder persists (List + Kanban); Gantt bar drag updates dates.
- [ ] Manual: the project UI uses daily's muted-gray theme (no raw blue accents) and mirrors PMS's layout/interactions.
- [ ] Manual: existing daily-todo features (recurring, annual tracking, eisenhower, daily dashboard) still work unchanged.
- [ ] DB-dependent: `drizzle-kit migrate` + `backfill-projects.ts` ran; every user has a default workspace; old tasks have correct `status`.
