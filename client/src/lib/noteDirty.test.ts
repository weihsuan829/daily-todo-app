import { describe, it, expect } from "vitest";
import { isNoteDirty } from "./noteDirty";

describe("isNoteDirty", () => {
  it("is false when title and content match the saved note", () => {
    expect(isNoteDirty("hi", "<p>x</p>", { title: "hi", content: "<p>x</p>" })).toBe(false);
  });

  it("is true when the title differs", () => {
    expect(isNoteDirty("new", "<p>x</p>", { title: "old", content: "<p>x</p>" })).toBe(true);
  });

  it("is true when the content differs", () => {
    expect(isNoteDirty("hi", "<p>y</p>", { title: "hi", content: "<p>x</p>" })).toBe(true);
  });

  it("treats null saved content as empty string", () => {
    expect(isNoteDirty("hi", "", { title: "hi", content: null })).toBe(false);
    expect(isNoteDirty("hi", "<p>x</p>", { title: "hi", content: null })).toBe(true);
  });
});
