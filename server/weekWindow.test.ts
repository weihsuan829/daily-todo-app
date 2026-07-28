import { describe, it, expect } from "vitest";
import { weekWindow, isWithinWeek } from "./weekWindow";

describe("weekWindow", () => {
  it("starts at midnight of the given day", () => {
    const { start } = weekWindow(new Date("2026-07-27T13:45:30.123Z"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date("2026-07-27T13:45:30.123Z").getDate());
  });

  it("ends exactly 7 calendar days after the start (date arithmetic, not 168 wall-clock hours)", () => {
    const { start, end } = weekWindow(new Date("2026-07-27T00:00:00.000Z"));
    const expectedEnd = new Date(start);
    expectedEnd.setDate(expectedEnd.getDate() + 7);
    expect(end.getTime()).toBe(expectedEnd.getTime());
    expect(end.getHours()).toBe(0);
  });

  it("handles a year rollover", () => {
    const { end } = weekWindow(new Date(2026, 11, 28));
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0); // January
    expect(end.getDate()).toBe(4);
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

describe("isWithinWeek", () => {
  const window = weekWindow(new Date("2026-07-27T00:00:00.000Z"));

  it("returns true for a date inside the window", () => {
    expect(isWithinWeek(new Date("2026-07-29T12:00:00.000Z"), window)).toBe(true);
  });

  it("returns true for the exact start (inclusive)", () => {
    expect(isWithinWeek(window.start, window)).toBe(true);
  });

  it("returns false for the exact end (exclusive)", () => {
    expect(isWithinWeek(window.end, window)).toBe(false);
  });

  it("returns false for a date before the window", () => {
    expect(isWithinWeek(new Date("2026-07-20T00:00:00.000Z"), window)).toBe(false);
  });

  it("returns false for a date after the window", () => {
    expect(isWithinWeek(new Date("2026-08-10T00:00:00.000Z"), window)).toBe(false);
  });
});
