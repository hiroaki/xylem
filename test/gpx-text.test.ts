import { describe, expect, it } from "vitest";
import { TEXT_LIMITS } from "../src/gpx/contract.js";
import { normalizeGpxText, isValidCanonicalText } from "../src/gpx/text.js";

for (const field of ["name", "desc", "sym"] as const) describe(`D16/D17 ${field}`, () => {
  const max = TEXT_LIMITS[field];
  it.each([max - 1, max, max + 1])("handles %i code points", count => {
    const value = "😀".repeat(count);
    const expected = count <= max ? value : field === "sym" ? undefined : "😀".repeat(max - 1) + "…";
    expect(normalizeGpxText(" \t" + value + "\n", field)).toBe(expected);
    expect(isValidCanonicalText(value, field)).toBe(count <= max);
  });
  it("does not split pairs, count graphemes, or append a second ellipsis", () => {
    const value = "a".repeat(max - 2) + "😀…";
    expect(normalizeGpxText(value, field)).toBe(value);
    const combining = "a".repeat(max - 1) + "e\u0301";
    expect(normalizeGpxText(combining, field)).toBe(field === "sym" ? undefined : "a".repeat(max - 1) + "…");
    const zwj = "a".repeat(max - 1) + "👩‍💻";
    expect(normalizeGpxText(zwj, field)).toBe(field === "sym" ? undefined : "a".repeat(max - 1) + "…");
  });
  it("only normalizes input, preserving internal legal text", () => {
    const value = " A\tB\nC\u007f<&>😀 ";
    expect(normalizeGpxText(value, field)).toBe(value.trim());
    expect(isValidCanonicalText(value, field)).toBe(true);
    for (const blank of [undefined, "", " \t\r\n"]) expect(normalizeGpxText(blank, field)).toBeUndefined();
  });
  it.each(["\u0000", "\u000b", "\ud800", "\udfff", "\ufffe", "\uffff"])("rejects illegal XML even after truncation boundary %#", invalid => {
    expect(() => normalizeGpxText("a".repeat(max + 1) + invalid, field)).toThrow("invalid GPX file");
    expect(isValidCanonicalText("a" + invalid, field)).toBe(false);
  });
});
