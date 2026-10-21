import { GpxNormalizationError } from "./errors.js";

// Preserve the existing conservative pre-parse security gate, including matches
// inside comments/CDATA. GPX does not require document types or custom entities.
const DOCTYPE_PATTERN = /<!DOCTYPE/i;
const ENTITY_PATTERN = /<!ENTITY/i;

// XML 1.0 NCName: namespace prefixes/local names must each be valid names,
// not just an XML Name that happens to contain a colon (e.g. a:1invalid).
const nameStart = "A-Z_a-z\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02ff\\u0370-\\u037d\\u037f-\\u1fff\\u200c-\\u200d\\u2070-\\u218f\\u2c00-\\u2fef\\u3001-\\ud7ff\\uf900-\\ufdcf\\ufdf0-\\ufffd\\u{10000}-\\u{effff}";
const ncName = new RegExp(`^[${nameStart}][${nameStart}0-9.\\-\\u00b7\\u0300-\\u036f\\u203f-\\u2040]*$`, "u");

export function isXmlNcName(name: string): boolean { return ncName.test(name); }

export function isXmlCharacter(code: number): boolean {
  return code === 0x9 || code === 0xa || code === 0xd
    || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd)
    || (code >= 0x10000 && code <= 0x10ffff);
}

export function assertSafeGpxXml(rawText: string, maxRawBytes: number): void {
  if (Buffer.byteLength(rawText, "utf8") > maxRawBytes) {
    throw new GpxNormalizationError("file too large");
  }
  if (DOCTYPE_PATTERN.test(rawText) || ENTITY_PATTERN.test(rawText)) {
    throw new GpxNormalizationError("invalid GPX file");
  }
  // Check even ignored metadata before a parser can discard or repair it.
  for (const character of rawText) {
    if (!isXmlCharacter(character.codePointAt(0)!)) {
      throw new GpxNormalizationError("invalid GPX file");
    }
  }
}
