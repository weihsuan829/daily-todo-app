export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

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
