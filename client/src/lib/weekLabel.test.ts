import { describe, it, expect } from "vitest";
import { formatMonthDay, weekRangeLabel } from "./weekLabel";

describe("formatMonthDay", () => {
  it("zero-pads month and day", () => {
    expect(formatMonthDay(new Date(2026, 0, 5))).toBe("01/05");
    expect(formatMonthDay(new Date(2026, 11, 25))).toBe("12/25");
  });
});

describe("weekRangeLabel", () => {
  it("spans the week start through six days later", () => {
    expect(weekRangeLabel(new Date(2026, 6, 27))).toBe("07/27 - 08/02");
  });

  it("handles a week that crosses a year boundary", () => {
    expect(weekRangeLabel(new Date(2026, 11, 28))).toBe("12/28 - 01/03");
  });

  it("does not mutate the date it is given", () => {
    const start = new Date(2026, 6, 27);
    weekRangeLabel(start);
    expect(start.getTime()).toBe(new Date(2026, 6, 27).getTime());
  });
});
