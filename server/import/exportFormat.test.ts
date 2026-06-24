import { describe, it, expect } from "vitest";
import { priorityToZh, statusToZh, formatDate, taskToRow, type ExportCtx } from "./exportFormat";
import { HEADER_ORDER } from "./types";

describe("exportFormat", () => {
  it("maps priority/status codes to Chinese", () => {
    expect(priorityToZh("urgent")).toBe("緊急");
    expect(priorityToZh("medium")).toBe("中");
    expect(statusToZh("in_progress")).toBe("進行中");
    expect(statusToZh("done")).toBe("完成");
  });

  it("formats dates as yyyy/M/d, blank for null", () => {
    expect(formatDate(new Date(2026, 5, 30))).toBe("2026/6/30");
    expect(formatDate(null)).toBe("");
  });

  it("taskToRow outputs values in HEADER_ORDER column order", () => {
    const ctx: ExportCtx = {
      placeholderName: new Map([[7, "阿明"]]),
      memberName: new Map(),
      tagNamesByTask: new Map([[1, ["購料", "急件"]]]),
      titleById: new Map([[9, "大任務"]]),
    };
    const row = taskToRow({
      id: 1, title: "小任務", description: "說明",
      priority: "high", status: "done",
      startDate: new Date(2026, 5, 30), dueDate: new Date(2026, 6, 15),
      assigneePlaceholderId: 7, assigneeId: null, parentTaskId: 9,
    }, ctx);
    expect(row.length).toBe(HEADER_ORDER.length);
    expect(row).toEqual(["小任務", "說明", "高", "完成", "2026/6/30", "2026/7/15", "阿明", "購料,急件", "大任務"]);
  });

  it("falls back to member name, then blank, for assignee", () => {
    const ctx: ExportCtx = { placeholderName: new Map(), memberName: new Map([[3, "我"]]), tagNamesByTask: new Map(), titleById: new Map() };
    const base = { id: 2, title: "T", description: null, priority: "low" as const, status: "todo" as const, startDate: null, dueDate: null, parentTaskId: null };
    expect(taskToRow({ ...base, assigneePlaceholderId: null, assigneeId: 3 }, ctx)[6]).toBe("我");
    expect(taskToRow({ ...base, assigneePlaceholderId: null, assigneeId: null }, ctx)[6]).toBe("");
  });
});
