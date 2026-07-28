import { describe, it, expect } from "vitest";
import { findImageItemIndex, screenshotFileName } from "./clipboardImage";

describe("findImageItemIndex", () => {
  it("returns the index of the first image file item", () => {
    const items = [
      { kind: "string", type: "text/plain" },
      { kind: "file", type: "image/png" },
      { kind: "file", type: "image/jpeg" },
    ];
    expect(findImageItemIndex(items)).toBe(1);
  });

  it("returns -1 when there is no image item", () => {
    expect(findImageItemIndex([])).toBe(-1);
    expect(
      findImageItemIndex([
        { kind: "string", type: "text/plain" },
        { kind: "file", type: "application/pdf" },
      ])
    ).toBe(-1);
  });

  it("ignores non-file items even with an image mime type", () => {
    expect(findImageItemIndex([{ kind: "string", type: "image/png" }])).toBe(-1);
  });
});

describe("screenshotFileName", () => {
  it("derives the extension from the mime subtype", () => {
    expect(screenshotFileName("image/png", 1753400000000)).toBe("screenshot-1753400000000.png");
    expect(screenshotFileName("image/jpeg", 1)).toBe("screenshot-1.jpeg");
  });

  it("strips svg+xml style suffixes and falls back to png", () => {
    expect(screenshotFileName("image/svg+xml", 2)).toBe("screenshot-2.svg");
    expect(screenshotFileName("", 3)).toBe("screenshot-3.png");
  });
});
