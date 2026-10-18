import { TEXT_LIMITS, type GpxTextField } from "./contract.js";
import { GpxNormalizationError } from "./errors.js";
import { isXmlCharacter } from "./xml-security-filter.js";

function isXmlText(value: string): boolean {
  for (const character of value) {
    if (!isXmlCharacter(character.codePointAt(0)!)) return false;
  }
  return true;
}

// Only original GPX ingestion may trim/truncate/omit. Structured text has already
// been omitted by the parser; validate characters before truncation or omission.
export function normalizeGpxText(raw: string | undefined, field: GpxTextField): string | undefined {
  if (raw === undefined) return undefined;
  if (!isXmlText(raw)) throw new GpxNormalizationError("invalid GPX file");
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const characters = Array.from(trimmed);
  const maximum = TEXT_LIMITS[field];
  if (characters.length <= maximum) return trimmed;
  return field === "sym" ? undefined : characters.slice(0, maximum - 1).join("") + "…";
}

// A predicate only: stored strings are never repaired, even when padded.
export function isValidCanonicalText(value: unknown, field: GpxTextField): value is string {
  return typeof value === "string" && value.trim().length > 0
    && Array.from(value).length <= TEXT_LIMITS[field] && isXmlText(value);
}
