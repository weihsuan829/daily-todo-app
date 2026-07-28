import { describe, it, expect } from "vitest";
import {
  splitByCompletion,
  computeQuadrantReorder,
  quadrantDefaultPriority,
  computeCrossQuadrantMove,
} from "./matrixDnd";

describe("splitByCompletion", () => {
  it("splits tasks into active and completed, preserving order", () => {
    const tasks = [
      { id: 1, completed: false },
      { id: 2, completed: true },
      { id: 3, completed: false },
    ];
    const { active, completed } = splitByCompletion(tasks);
    expect(active.map((t) => t.id)).toEqual([1, 3]);
    expect(completed.map((t) => t.id)).toEqual([2]);
  });

  it("handles empty input", () => {
    expect(splitByCompletion([])).toEqual({ active: [], completed: [] });
  });
});

describe("computeQuadrantReorder", () => {
  const tasks = [{ id: 10 }, { id: 20 }, { id: 30 }];

  it("moves an item down past another", () => {
    expect(computeQuadrantReorder(tasks, 10, 30)).toEqual([20, 30, 10]);
  });

  it("moves an item up past another", () => {
    expect(computeQuadrantReorder(tasks, 30, 10)).toEqual([30, 10, 20]);
  });

  it("returns null when active and over are the same", () => {
    expect(computeQuadrantReorder(tasks, 20, 20)).toBeNull();
  });

  it("returns null when either id is not in the list", () => {
    expect(computeQuadrantReorder(tasks, 99, 10)).toBeNull();
    expect(computeQuadrantReorder(tasks, 10, 99)).toBeNull();
  });
});

describe("quadrantDefaultPriority", () => {
  it("maps each quadrant to its default priority", () => {
    expect(quadrantDefaultPriority("urgent-important")).toBe("high");
    expect(quadrantDefaultPriority("not-urgent-important")).toBe("medium");
    expect(quadrantDefaultPriority("urgent-not-important")).toBe("medium");
    expect(quadrantDefaultPriority("not-urgent-not-important")).toBe("low");
  });
});

describe("computeCrossQuadrantMove", () => {
  it("inserts before the hovered task and builds the update payload", () => {
    const { update, orderedIds } = computeCrossQuadrantMove(5, "urgent-important", [10, 20], 20);
    expect(update).toEqual({ id: 5, quadrant: "urgent-important", priority: "high" });
    expect(orderedIds).toEqual([10, 5, 20]);
  });

  it("appends when dropped on the quadrant container (overId null)", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "not-urgent-not-important", [10, 20], null);
    expect(orderedIds).toEqual([10, 20, 5]);
  });

  it("appends when overId is not found in the target list", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "urgent-not-important", [10, 20], 99);
    expect(orderedIds).toEqual([10, 20, 5]);
  });

  it("works for an empty target quadrant", () => {
    const { update, orderedIds } = computeCrossQuadrantMove(5, "not-urgent-important", [], null);
    expect(update.priority).toBe("medium");
    expect(orderedIds).toEqual([5]);
  });

  it("ignores the active id if it already appears in the target list", () => {
    const { orderedIds } = computeCrossQuadrantMove(5, "urgent-important", [10, 5, 20], 10);
    expect(orderedIds).toEqual([5, 10, 20]);
  });
});
