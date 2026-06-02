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
  it("status=archived forces completed=false + clears completedAt", () => {
    const o = applyStatusCompletionSync({ status: "archived" });
    expect(o.completed).toBe(false);
    expect(o.status).toBe("archived");
    expect(o.completedAt).toBeNull();
  });
  it("passes through unrelated fields", () => {
    const o = applyStatusCompletionSync({ title: "x" });
    expect(o.title).toBe("x"); expect(o.status).toBeUndefined(); expect(o.completed).toBeUndefined();
  });
});
