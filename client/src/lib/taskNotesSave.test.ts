import { describe, it, expect } from "vitest";
import { buildTaskNotesUpdate } from "./taskNotesSave";

const lifeTask = { id: 1, title: "買菜", category: "life" };
const matrixTask = { id: 2, title: "報價單", category: "eisenhower" };

describe("buildTaskNotesUpdate", () => {
  it("returns null when the trimmed title is empty", () => {
    expect(
      buildTaskNotesUpdate(lifeTask, { title: "   ", notes: "x", priority: "high" })
    ).toBeNull();
  });

  it("omits title when unchanged (after trim)", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: "  買菜  ", notes: "n", priority: "high" });
    expect(u).toEqual({ id: 1, description: "n", priority: "high" });
  });

  it("includes trimmed title when changed", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: " 買晚餐 ", notes: "n", priority: "low" });
    expect(u).toEqual({ id: 1, title: "買晚餐", description: "n", priority: "low" });
  });

  it("caps the title at 255 characters (trim first)", () => {
    const long = "  " + "a".repeat(300) + "  ";
    const u = buildTaskNotesUpdate(lifeTask, { title: long, notes: "", priority: "medium" });
    expect(u?.title).toHaveLength(255);
  });

  it("omits priority for eisenhower tasks", () => {
    const u = buildTaskNotesUpdate(matrixTask, { title: "報價單", notes: "n", priority: "high" });
    expect(u).toEqual({ id: 2, description: "n" });
  });

  it("keeps empty notes as empty string (clearing notes is allowed)", () => {
    const u = buildTaskNotesUpdate(lifeTask, { title: "買菜", notes: "", priority: "medium" });
    expect(u).toEqual({ id: 1, description: "", priority: "medium" });
  });
});
