import type { Task } from "../../../drizzle/schema";

export type SortField = "manual" | "priority" | "due_date" | "created_at" | "title";
export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

export type FilterCondition =
  | { type: "priority"; values: ("low" | "medium" | "high" | "urgent")[] }
  | { type: "tag"; values: number[] }
  | { type: "assignee"; values: (number | null)[] }
  | { type: "due"; op: "before" | "after" | "between"; date: string; dateEnd?: string };

export type AssigneeQuick = "all" | "me";

export interface FilterState {
  sort: SortState;
  filters: FilterCondition[];
  /** When false, hide "done" tasks */
  closed: boolean;
  /** Quick assignee toggle: "all" shows everyone; "me" shows only tasks assigned to current user */
  assigneeQuick: AssigneeQuick;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  sort: { field: "manual", dir: "asc" },
  filters: [],
  closed: true,
  assigneeQuick: "all",
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function priorityRank(p: string | null | undefined): number {
  return PRIORITY_RANK[p ?? ""] ?? 0;
}

export function isFilterStateDefault(s: FilterState): boolean {
  return (
    s.sort.field === "manual" &&
    s.filters.length === 0 &&
    s.closed === true &&
    s.assigneeQuick === "all"
  );
}

export interface FilterSortCtx {
  currentUserId: number | null;
  tagIdsOf: (task: Task) => number[];
}

function matchesCondition(
  task: Task,
  cond: FilterCondition,
  ctx: FilterSortCtx
): boolean {
  switch (cond.type) {
    case "priority": {
      const p = task.priority ?? null;
      return cond.values.some((v) => v === p);
    }
    case "tag": {
      if (cond.values.length === 0) return true;
      const ids = ctx.tagIdsOf(task);
      return cond.values.some((id) => ids.includes(id));
    }
    case "assignee": {
      const ta = task.assigneeId ?? null;
      return cond.values.some((v) => v === ta);
    }
    case "due": {
      if (!task.dueDate) return false;
      // Format dueDate as yyyy-MM-dd for string comparison
      const due = task.dueDate instanceof Date
        ? task.dueDate.toISOString().slice(0, 10)
        : String(task.dueDate).slice(0, 10);
      if (cond.op === "before") return due < cond.date;
      if (cond.op === "after") return due > cond.date;
      if (cond.op === "between")
        return cond.dateEnd ? due >= cond.date && due <= cond.dateEnd : due >= cond.date;
      return false;
    }
    default:
      return true;
  }
}

function matchesAssigneeQuick(
  task: Task,
  quick: AssigneeQuick,
  currentUserId: number | null
): boolean {
  if (quick === "all") return true;
  if (quick === "me") return currentUserId != null && task.assigneeId === currentUserId;
  return true;
}

export function passesFilters(
  task: Task,
  state: FilterState,
  ctx: FilterSortCtx
): boolean {
  if (!state.closed && task.status === "done") return false;
  if (!matchesAssigneeQuick(task, state.assigneeQuick, ctx.currentUserId)) return false;
  for (const cond of state.filters) {
    if (!matchesCondition(task, cond, ctx)) return false;
  }
  return true;
}

function compareTasks(a: Task, b: Task, sort: SortState): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "manual":
      return ((a.order ?? 0) - (b.order ?? 0)) * sign || a.id - b.id;
    case "priority": {
      const r = priorityRank(a.priority) - priorityRank(b.priority);
      return r * sign || a.id - b.id;
    }
    case "due_date": {
      // null dueDate sorts last regardless of direction
      if (!a.dueDate && !b.dueDate) return a.id - b.id;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const aTime = (a.dueDate as Date).getTime();
      const bTime = (b.dueDate as Date).getTime();
      return (aTime - bTime) * sign || a.id - b.id;
    }
    case "created_at": {
      const aTime = (a.createdAt as Date).getTime();
      const bTime = (b.createdAt as Date).getTime();
      return (aTime - bTime) * sign || a.id - b.id;
    }
    case "title":
      return a.title.localeCompare(b.title) * sign || a.id - b.id;
    default:
      return a.id - b.id;
  }
}

export function applyFilterSort(
  tasks: Task[],
  state: FilterState,
  ctx: FilterSortCtx
): Task[] {
  const filtered = tasks.filter((t) => passesFilters(t, state, ctx));
  return filtered.sort((a, b) => compareTasks(a, b, state.sort));
}

/** Returns which statuses should be visible */
export function visibleStatuses(state: FilterState): ("todo" | "in_progress" | "done")[] {
  const all: ("todo" | "in_progress" | "done")[] = ["todo", "in_progress", "done"];
  return state.closed ? all : all.filter((s) => s !== "done");
}
