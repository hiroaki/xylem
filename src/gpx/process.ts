import { encodeCanonicalJson, CanonicalJsonLimitError } from "./json.js";
import { serializeGpx } from "./serialize.js";
import { GpxNormalizationError } from "./errors.js";
import type { GpxPolicy } from "../policy.js";
import { canonicalizeGpx } from "./canonicalize.js";
import { parseGpxXml } from "./parse.js";
import { assertValidCanonicalGpxDocument } from "./schema.js";

// Both original-file endpoints share this authoritative input boundary.
export function processGpxInput(rawText: string, policy: GpxPolicy) {
  const canonical = canonicalizeGpx(parseGpxXml(rawText, policy.maxRawBytes), policy);
  assertValidCanonicalGpxDocument(canonical, policy);
  return canonical;
}

// Enforce actual bytes before decoding; a legal literal U+FFFD is preserved.
export function processGpxBytes(bytes: Uint8Array, policy: GpxPolicy) {
  if (bytes.byteLength > policy.maxRawBytes) throw new GpxNormalizationError("file too large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) throw new GpxNormalizationError("invalid GPX file");
    throw error;
  }
  if (text.startsWith("\ufeff")) text = text.slice(1);
  if (text.startsWith("\ufeff")) throw new GpxNormalizationError("invalid GPX file");
  return processGpxInput(text, policy);
}

export async function processGpxFile(file: File, policy: GpxPolicy) {
  return processGpxBytes(new Uint8Array(await file.arrayBuffer()), policy);
}

// Shared input preparation: invariant failures remain internal; only the
// canonical byte budget is an expected input rejection.
export function prepareCanonicalGpx(canonical: unknown, policy: GpxPolicy) {
  assertValidCanonicalGpxDocument(canonical, policy);
  let json: string;
  try { json = encodeCanonicalJson(canonical); }
  catch (error) {
    if (error instanceof CanonicalJsonLimitError) throw new GpxNormalizationError("canonical JSON too large");
    throw error;
  }
  const xml = serializeGpx(canonical, policy);
  return { json, xml };
}
