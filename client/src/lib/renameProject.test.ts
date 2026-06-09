import { describe, it, expect } from "vitest";
import { nextProjectName } from "./renameProject";

describe("nextProjectName", () => {
  it("returns the trimmed name when it changed", () => {
    expect(nextProjectName("OOBA", "  New Name  ")).toBe("New Name");
  });

  it("returns null when the trimmed value is empty", () => {
    expect(nextProjectName("OOBA", "   ")).toBeNull();
    expect(nextProjectName("OOBA", "")).toBeNull();
  });

  it("returns null when the name is unchanged (after trim)", () => {
    expect(nextProjectName("OOBA", "OOBA")).toBeNull();
    expect(nextProjectName("OOBA", "  OOBA  ")).toBeNull();
  });

  it("caps the name at 100 characters", () => {
    const long = "a".repeat(150);
    const result = nextProjectName("OOBA", long);
    expect(result).toHaveLength(100);
  });

  it("trims before measuring the 100-char cap", () => {
    const padded = "   " + "b".repeat(100) + "   ";
    expect(nextProjectName("OOBA", padded)).toBe("b".repeat(100));
  });
});
