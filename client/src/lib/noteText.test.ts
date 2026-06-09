import { describe, it, expect } from "vitest";
import { htmlToPlainText, noteMatchesQuery, parseTags } from "./noteText";

describe("htmlToPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    expect(htmlToPlainText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });
  it("turns block boundaries into spaces, not glued words", () => {
    expect(htmlToPlainText("<p>one</p><p>two</p>")).toBe("one two");
  });
  it("drops img tags (no alt noise)", () => {
    expect(htmlToPlainText('<p>see</p><img src="/x.png">')).toBe("see");
  });
  it("handles empty/nullish", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText(null)).toBe("");
  });
});

describe("noteMatchesQuery", () => {
  const note = { title: "採購清單", content: "<p>水氣設備 15 台</p>" };
  it("matches in title (case-insensitive)", () => {
    expect(noteMatchesQuery(note, "採購")).toBe(true);
  });
  it("matches in content plain text", () => {
    expect(noteMatchesQuery(note, "設備")).toBe(true);
  });
  it("returns true for empty query", () => {
    expect(noteMatchesQuery(note, "  ")).toBe(true);
  });
  it("returns false when no match", () => {
    expect(noteMatchesQuery(note, "xyz")).toBe(false);
  });
});

describe("parseTags", () => {
  it("parses a JSON array string", () => {
    expect(parseTags('["a","b"]')).toEqual(["a", "b"]);
  });
  it("returns [] for null/empty/invalid", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("not json")).toEqual([]);
  });
});
