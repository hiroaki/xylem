import { GpxNormalizationError } from "./errors.js";
import { MAX_RAW_GPX_BYTES } from "./limits.js";

// Defense in depth: reject dangerous XML constructs before the XML parser ever sees
// the text, independent of whatever hardening options the parser library claims.
const DOCTYPE_PATTERN = /<!DOCTYPE/i;
const ENTITY_PATTERN = /<!ENTITY/i;

export function assertSafeGpxXml(rawText: string): void {
  const byteLength = Buffer.byteLength(rawText, "utf8");

  if (byteLength > MAX_RAW_GPX_BYTES) {
    throw new GpxNormalizationError("file too large");
  }

  if (DOCTYPE_PATTERN.test(rawText)) {
    throw new GpxNormalizationError("invalid GPX file");
  }

  if (ENTITY_PATTERN.test(rawText)) {
    throw new GpxNormalizationError("invalid GPX file");
  }
}
