import { GpxNormalizationError } from "./errors.js";

// Defense in depth: reject dangerous XML constructs before the XML parser ever sees
// the text, independent of whatever hardening options the parser library claims.
const DOCTYPE_PATTERN = /<!DOCTYPE/i;
const ENTITY_PATTERN = /<!ENTITY/i;

// Pre-parse security gate:
// - enforce raw UTF-8 size limits
// - reject XML constructs that must never reach the parser
// Parser hardening is not treated as the only security boundary.
export function assertSafeGpxXml(rawText: string, maxRawBytes: number): void {
  const byteLength = Buffer.byteLength(rawText, "utf8");

  if (byteLength > maxRawBytes) {
    throw new GpxNormalizationError("file too large");
  }

  if (DOCTYPE_PATTERN.test(rawText)) {
    throw new GpxNormalizationError("invalid GPX file");
  }

  if (ENTITY_PATTERN.test(rawText)) {
    throw new GpxNormalizationError("invalid GPX file");
  }
}
