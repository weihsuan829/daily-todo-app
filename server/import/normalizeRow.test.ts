import { describe, it, expect } from "vitest";
import { normalizeRow } from "./normalizeRow";
import { COLUMNS } from "./types";

const base = () => ({ [COLUMNS.title]: "買料" } as Record<string, unknown>);

describe("normalizeRow", () => {
  it("requires title", () => {
    const r = normalizeRow({ [COLUMNS.title]: "  " }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("任務名稱");
  });

  it("defaults priority=medium, status=todo when blank", () => {
    const r = normalizeRow(base(), 2);
    expect(r.ok).toBe(true);
    expect(r.task.priority).toBe("medium");
    expect(r.task.status).toBe("todo");
  });

  it("maps Chinese enums", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "緊急", [COLUMNS.status]: "進行中" }, 2);
    expect(r.task.priority).toBe("urgent");
    expect(r.task.status).toBe("in_progress");
  });

  it("accepts english enums", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "high", [COLUMNS.status]: "done" }, 2);
    expect(r.task.priority).toBe("high");
    expect(r.task.status).toBe("done");
  });

  it("errors on invalid enum", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.priority]: "超急" }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("優先級");
  });

  it("parses date strings and Date cells", () => {
    const r1 = normalizeRow({ ...base(), [COLUMNS.dueDate]: "2026/7/15" }, 2);
    expect(r1.task.dueDate?.getFullYear()).toBe(2026);
    const d = new Date(2026, 6, 1);
    const r2 = normalizeRow({ ...base(), [COLUMNS.startDate]: d }, 2);
    expect(r2.task.startDate?.getMonth()).toBe(6);
  });

  it("errors on unparseable date", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.dueDate]: "下週" }, 2);
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain("截止日");
  });

  it("splits tags on Chinese/English commas, trims, drops blanks", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.tags]: "購料, 急件，" }, 2);
    expect(r.task.tagNames).toEqual(["購料", "急件"]);
  });

  it("captures assignee and parent names, null when blank", () => {
    const r = normalizeRow({ ...base(), [COLUMNS.assignee]: " 阿明 ", [COLUMNS.parent]: "大任務" }, 2);
    expect(r.task.assigneeName).toBe("阿明");
    expect(r.task.parentName).toBe("大任務");
    const r2 = normalizeRow(base(), 2);
    expect(r2.task.assigneeName).toBeNull();
    expect(r2.task.parentName).toBeNull();
  });
});
