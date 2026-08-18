import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertSafeGpxXml } from "../src/gpx/xml-security-filter.js";
import { MAX_RAW_GPX_BYTES } from "../src/gpx/limits.js";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("assertSafeGpxXml", () => {
  it("allows a benign GPX document", () => {
    expect(() => assertSafeGpxXml(fixture("sample.gpx"))).not.toThrow();
  });

  it("rejects DOCTYPE declarations", () => {
    expect(() => assertSafeGpxXml(fixture("doctype.gpx"))).toThrow();
  });

  it("rejects ENTITY declarations", () => {
    expect(() => assertSafeGpxXml(fixture("entity.gpx"))).toThrow();
  });

  it("rejects nested/parameter entity variants", () => {
    const parameterEntity = `<?xml version="1.0"?>
<!DOCTYPE gpx [
  <!ENTITY % param "SYSTEM">
  <!ENTITY xxe %param;>
]>
<gpx></gpx>`;

    expect(() => assertSafeGpxXml(parameterEntity)).toThrow();
  });

  it("rejects input exceeding the byte-length cap", () => {
    const oversized = `<gpx>${"a".repeat(MAX_RAW_GPX_BYTES + 1)}</gpx>`;

    expect(() => assertSafeGpxXml(oversized)).toThrow();
  });

  it("does not reject well-formed input at or under the byte-length cap", () => {
    const atCap = "a".repeat(MAX_RAW_GPX_BYTES - "<gpx></gpx>".length);

    expect(() => assertSafeGpxXml(`<gpx>${atCap}</gpx>`)).not.toThrow();
  });
});
