import { type Priority, type Status } from "./types";

const PRIORITY_ZH: Record<Priority, string> = { low: "低", medium: "中", high: "高", urgent: "緊急" };
const STATUS_ZH: Record<Status, string> = { todo: "待辦", in_progress: "進行中", done: "完成", archived: "封存" };

export function priorityToZh(p: Priority): string { return PRIORITY_ZH[p] ?? ""; }
export function statusToZh(s: Status): string { return STATUS_ZH[s] ?? ""; }

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

export interface ExportTask {
  id: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  startDate: Date | null;
  dueDate: Date | null;
  assigneePlaceholderId: number | null;
  assigneeId: number | null;
  parentTaskId: number | null;
}

export interface ExportCtx {
  placeholderName: Map<number, string>;
  memberName: Map<number, string>;
  tagNamesByTask: Map<number, string[]>;
  titleById: Map<number, string>;
}

// Column order MUST match HEADER_ORDER:
// [任務名稱, 描述, 優先級, 狀態, 開始日, 截止日, 負責人, 標籤, 上層任務名稱]
export function taskToRow(t: ExportTask, ctx: ExportCtx): string[] {
  const assignee =
    t.assigneePlaceholderId != null ? (ctx.placeholderName.get(t.assigneePlaceholderId) ?? "")
    : t.assigneeId != null ? (ctx.memberName.get(t.assigneeId) ?? "")
    : "";
  const tags = (ctx.tagNamesByTask.get(t.id) ?? []).join(",");
  const parent = t.parentTaskId != null ? (ctx.titleById.get(t.parentTaskId) ?? "") : "";
  return [
    t.title,
    t.description ?? "",
    priorityToZh(t.priority),
    statusToZh(t.status),
    formatDate(t.startDate),
    formatDate(t.dueDate),
    assignee,
    tags,
    parent,
  ];
}
