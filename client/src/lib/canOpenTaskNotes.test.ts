import { describe, expect, it } from "vitest";
import { canOpenTaskNotes } from "./canOpenTaskNotes";

describe("canOpenTaskNotes", () => {
  it("returns true for a real task", () => {
    expect(canOpenTaskNotes({ id: 5 })).toBe(true);
  });

  it("returns false for a virtual recurring task row (negative id)", () => {
    expect(canOpenTaskNotes({ id: -3 })).toBe(false);
  });

  it("returns false for a real id flagged as recurring", () => {
    expect(canOpenTaskNotes({ id: 5, isRecurring: true })).toBe(false);
  });

  it("returns true for a real id explicitly not recurring", () => {
    expect(canOpenTaskNotes({ id: 5, isRecurring: false })).toBe(true);
  });

  it("returns false for id 0", () => {
    expect(canOpenTaskNotes({ id: 0 })).toBe(false);
  });
});
