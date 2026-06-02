import type { Task } from "../../../drizzle/schema";

export interface TaskNode {
  task: Task;
  children: TaskNode[];
}

/** Build a task tree from a flat task array (by parentTaskId) */
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const byId = new Map<number, TaskNode>();
  for (const t of tasks) byId.set(t.id, { task: t, children: [] });
  const roots: TaskNode[] = [];
  for (const t of tasks) {
    const node = byId.get(t.id)!;
    if (t.parentTaskId != null && byId.has(t.parentTaskId)) {
      byId.get(t.parentTaskId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Count subtasks for a given parent task */
export function countSubtasks(parentId: number, tasks: Task[]): number {
  return tasks.filter((t) => t.parentTaskId === parentId).length;
}

export interface EffectiveDates {
  startDate: Date | null;
  dueDate: Date | null;
  /** Whether the dates are aggregated from children (true = read-only) */
  isAggregated: boolean;
}

/**
 * Get the effective display dates for a task:
 * - If it has subtasks with dates → aggregate min(startDate) / max(dueDate) from children
 * - If children have no dates → fall back to the task's own dates, isAggregated=false
 * - If no subtasks → use the task's own dates, isAggregated=false
 */
export function getEffectiveDates(
  task: Task,
  subtasks: Task[] | undefined
): EffectiveDates {
  if (!subtasks || subtasks.length === 0) {
    return {
      startDate: task.startDate ?? null,
      dueDate: task.dueDate ?? null,
      isAggregated: false,
    };
  }

  const starts = subtasks
    .map((t) => t.startDate)
    .filter((d): d is Date => d != null);
  const dues = subtasks
    .map((t) => t.dueDate)
    .filter((d): d is Date => d != null);

  // If children have no dates, fall back to task's own dates
  if (starts.length === 0 && dues.length === 0) {
    return {
      startDate: task.startDate ?? null,
      dueDate: task.dueDate ?? null,
      isAggregated: false,
    };
  }

  const minStart =
    starts.length > 0
      ? starts.reduce((a, b) => (a.getTime() < b.getTime() ? a : b))
      : null;
  const maxDue =
    dues.length > 0
      ? dues.reduce((a, b) => (a.getTime() > b.getTime() ? a : b))
      : null;

  return {
    startDate: minStart,
    dueDate: maxDue,
    isAggregated: true,
  };
}
