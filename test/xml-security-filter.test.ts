import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertSafeGpxXml } from "../src/gpx/xml-security-filter.js";

const MAX_RAW_GPX_BYTES = 2 * 1024 * 1024;

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("assertSafeGpxXml", () => {
  it("allows a benign GPX document", () => {
    expect(() => assertSafeGpxXml(fixture("sample.gpx"), MAX_RAW_GPX_BYTES)).not.toThrow();
  });

  it("rejects DOCTYPE declarations", () => {
    expect(() => assertSafeGpxXml(fixture("doctype.gpx"), MAX_RAW_GPX_BYTES)).toThrow();
  });

  it("rejects ENTITY declarations", () => {
    expect(() => assertSafeGpxXml(fixture("entity.gpx"), MAX_RAW_GPX_BYTES)).toThrow();
  });

  it("rejects nested/parameter entity variants", () => {
    const parameterEntity = `<?xml version="1.0"?>
<!DOCTYPE gpx [
  <!ENTITY % param "SYSTEM">
  <!ENTITY xxe %param;>
]>
<gpx></gpx>`;

    expect(() => assertSafeGpxXml(parameterEntity, MAX_RAW_GPX_BYTES)).toThrow();
  });

  it("rejects input exceeding the byte-length cap", () => {
    const oversized = `<gpx>${"a".repeat(MAX_RAW_GPX_BYTES + 1)}</gpx>`;

    expect(() => assertSafeGpxXml(oversized, MAX_RAW_GPX_BYTES)).toThrow();
  });

  it("does not reject well-formed input at or under the byte-length cap", () => {
    const atCap = "a".repeat(MAX_RAW_GPX_BYTES - "<gpx></gpx>".length);

    expect(() => assertSafeGpxXml(`<gpx>${atCap}</gpx>`, MAX_RAW_GPX_BYTES)).not.toThrow();
  });
});
