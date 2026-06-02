import { describe, expect, it } from "vitest";
import { getEffectiveDates } from "./taskHierarchy";
import type { Task } from "../../../drizzle/schema";

function task(partial: Partial<Task>): Task {
  return { id: 0, startDate: null, dueDate: null, parentTaskId: null, ...partial } as Task;
}
const d = (iso: string) => new Date(iso);

describe("getEffectiveDates", () => {
  it("no subtasks → own dates, not aggregated", () => {
    const r = getEffectiveDates(task({ startDate: d("2026-06-02"), dueDate: d("2026-06-04") }), []);
    expect(r.isAggregated).toBe(false);
    expect(r.startDate).toEqual(d("2026-06-02"));
    expect(r.dueDate).toEqual(d("2026-06-04"));
  });

  it("subtasks with only due dates → span earliest→latest (the reported bug)", () => {
    const subs = [task({ id: 1, dueDate: d("2026-06-04") }), task({ id: 2, dueDate: d("2026-06-05") })];
    const r = getEffectiveDates(task({ id: 10 }), subs);
    expect(r.isAggregated).toBe(true);
    expect(r.startDate).toEqual(d("2026-06-04"));
    expect(r.dueDate).toEqual(d("2026-06-05"));
  });

  it("subtasks with start+due → min(all)→max(all)", () => {
    const subs = [
      task({ id: 1, startDate: d("2026-06-01"), dueDate: d("2026-06-03") }),
      task({ id: 2, dueDate: d("2026-06-07") }),
    ];
    const r = getEffectiveDates(task({ id: 10 }), subs);
    expect(r.isAggregated).toBe(true);
    expect(r.startDate).toEqual(d("2026-06-01"));
    expect(r.dueDate).toEqual(d("2026-06-07"));
  });

  it("subtasks all on one day → single date (start null), aggregated", () => {
    const subs = [task({ id: 1, dueDate: d("2026-06-05") })];
    const r = getEffectiveDates(task({ id: 10 }), subs);
    expect(r.isAggregated).toBe(true);
    expect(r.startDate).toBeNull();
    expect(r.dueDate).toEqual(d("2026-06-05"));
  });

  it("subtasks with no dates → fall back to own dates, not aggregated", () => {
    const subs = [task({ id: 1 }), task({ id: 2 })];
    const r = getEffectiveDates(task({ id: 10, dueDate: d("2026-06-09") }), subs);
    expect(r.isAggregated).toBe(false);
    expect(r.dueDate).toEqual(d("2026-06-09"));
  });
});
