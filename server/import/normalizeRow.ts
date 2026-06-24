import { COLUMNS, type NormalizedTaskInput, type Priority, type RawRow, type Status } from "./types";

const PRIORITY_MAP: Record<string, Priority> = {
  "低": "low", "中": "medium", "高": "high", "緊急": "urgent",
  low: "low", medium: "medium", high: "high", urgent: "urgent",
};
const STATUS_MAP: Record<string, Status> = {
  "待辦": "todo", "進行中": "in_progress", "完成": "done", "封存": "archived",
  todo: "todo", in_progress: "in_progress", done: "done", archived: "archived",
};

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function parseDateCell(v: unknown): { date: Date | null; ok: boolean } {
  if (v == null || (typeof v === "string" && v.trim() === "")) return { date: null, ok: true };
  if (v instanceof Date && !isNaN(v.getTime())) return { date: v, ok: true };
  const s = String(v).trim();
  // accept yyyy/m/d or yyyy-m-d
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return { date: d, ok: true };
  }
  return { date: null, ok: false };
}

export function normalizeRow(raw: RawRow, rowNum: number): { task: NormalizedTaskInput; messages: string[]; ok: boolean } {
  const messages: string[] = [];
  const get = (k: string) => cellToString(raw[k]);

  const title = get(COLUMNS.title);
  if (!title) messages.push(`第 ${rowNum} 列:缺「任務名稱」`);

  let priority: Priority = "medium";
  const pRaw = get(COLUMNS.priority);
  if (pRaw) {
    const mapped = PRIORITY_MAP[pRaw];
    if (!mapped) messages.push(`第 ${rowNum} 列:「優先級」值不合法(${pRaw})`);
    else priority = mapped;
  }

  let status: Status = "todo";
  const sRaw = get(COLUMNS.status);
  if (sRaw) {
    const mapped = STATUS_MAP[sRaw];
    if (!mapped) messages.push(`第 ${rowNum} 列:「狀態」值不合法(${sRaw})`);
    else status = mapped;
  }

  const startP = parseDateCell(raw[COLUMNS.startDate]);
  if (!startP.ok) messages.push(`第 ${rowNum} 列:「開始日」無法解析`);
  const dueP = parseDateCell(raw[COLUMNS.dueDate]);
  if (!dueP.ok) messages.push(`第 ${rowNum} 列:「截止日」無法解析`);

  const descRaw = get(COLUMNS.description);
  const assignee = get(COLUMNS.assignee);
  const parent = get(COLUMNS.parent);
  const tagNames = get(COLUMNS.tags)
    .split(/[,，]/).map((t) => t.trim()).filter(Boolean);

  const task: NormalizedTaskInput = {
    title,
    description: descRaw || null,
    priority,
    status,
    startDate: startP.date,
    dueDate: dueP.date,
    assigneeName: assignee || null,
    tagNames,
    parentName: parent || null,
  };

  return { task, messages, ok: messages.length === 0 };
}
