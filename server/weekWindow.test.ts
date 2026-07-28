import { describe, it, expect } from "vitest";
import { weekWindow } from "./weekWindow";

describe("weekWindow", () => {
  it("starts at midnight of the given day", () => {
    const { start } = weekWindow(new Date("2026-07-27T13:45:30.123Z"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date("2026-07-27T13:45:30.123Z").getDate());
  });

  it("ends exactly 7 days after the start", () => {
    const { start, end } = weekWindow(new Date("2026-07-27T00:00:00.000Z"));
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-07-27T13:45:30.123Z");
    const snapshot = input.getTime();
    weekWindow(input);
    expect(input.getTime()).toBe(snapshot);
  });

  it("handles a month boundary", () => {
    const { start, end } = weekWindow(new Date(2026, 6, 27, 9, 0, 0)); // 2026-07-27 local
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(27);
    expect(end.getMonth()).toBe(7); // August
    expect(end.getDate()).toBe(3);
  });
});
