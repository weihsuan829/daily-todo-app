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
