import { describe, expect, it, vi } from "vitest";
import { isValidGpxTime, normalizeGpxTime } from "../src/gpx/time.js";
import { invalidTimes, validTimes } from "./helpers/phase-b.js";

describe("D13 exact string time policy", () => {
  it.each(validTimes.map((value, index) => ({value, index})))("accepts/preserves valid case $index", ({value}) => {
    expect(isValidGpxTime(value)).toBe(true);
    expect(normalizeGpxTime(" \t" + value + "\n")).toBe(value);
  });
  it.each(invalidTimes.map((value, index) => ({value, index})))("rejects invalid canonical case $index", ({value}) => {
    expect(isValidGpxTime(value)).toBe(false);
    expect(normalizeGpxTime(value)).toBe(isValidGpxTime(value.trim()) ? value.trim() : undefined);
  });
  it.each([undefined, null, false, 0, [], {}, new Date()])("rejects non-string case %#", value => {
    expect(isValidGpxTime(value)).toBe(false);
  });
  it.each([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, index) => ({ month: String(index + 1).padStart(2, "0"), days })))("checks last day of month $month", ({month, days}) => {
    expect(isValidGpxTime(`2025-${month}-${days}T00:00:00Z`)).toBe(true);
    expect(isValidGpxTime(`2025-${month}-${days + 1}T00:00:00Z`)).toBe(false);
  });
  it("does not use Date.parse or reject offsets crossing UTC year boundaries", () => {
    const parse = vi.spyOn(Date, "parse").mockImplementation(() => { throw new Error("Date.parse must not be used"); });
    try {
      for (const value of ["0001-01-01T00:00:00+14:00", "9999-12-31T23:59:59-14:00"]) {
        expect(normalizeGpxTime(value)).toBe(value);
      }
      expect(normalizeGpxTime(undefined)).toBeUndefined();
    } finally { parse.mockRestore(); }
  });
});
