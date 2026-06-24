export const COLUMNS = {
  title: "任務名稱",
  description: "描述",
  priority: "優先級",
  status: "狀態",
  startDate: "開始日",
  dueDate: "截止日",
  assignee: "負責人",
  tags: "標籤",
  parent: "上層任務名稱",
} as const;

export const HEADER_ORDER: string[] = [
  COLUMNS.title, COLUMNS.description, COLUMNS.priority, COLUMNS.status,
  COLUMNS.startDate, COLUMNS.dueDate, COLUMNS.assignee, COLUMNS.tags, COLUMNS.parent,
];

export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "todo" | "in_progress" | "done" | "archived";

// One raw row read from the sheet: header text -> cell value (string | number | Date | null)
export type RawRow = Record<string, string | number | Date | null | undefined>;

export interface NormalizedTaskInput {
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  startDate: Date | null;
  dueDate: Date | null;
  assigneeName: string | null;
  tagNames: string[];
  parentName: string | null;
}

export type ImportRowAction = "create" | "update" | "error";

export interface PreviewRow {
  rowNum: number;
  action: ImportRowAction;
  task: NormalizedTaskInput;
  messages: string[]; // errors (action==="error") or warnings
}

export interface ImportPreview {
  summary: { create: number; update: number; error: number; warning: number };
  rows: PreviewRow[];
}
