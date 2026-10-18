// Canonical content, excluding HTTP framing and the storage record.
export const MAX_CANONICAL_JSON_BYTES = 10 * 1024 * 1024;

export class CanonicalJsonLimitError extends Error {
  constructor() { super("canonical JSON too large"); }
}

export function encodeCanonicalJson(content: unknown): string {
  const json = JSON.stringify(content);
  if (typeof json !== "string") throw new Error("invalid canonical JSON");
  if (new TextEncoder().encode(json).byteLength > MAX_CANONICAL_JSON_BYTES) {
    throw new CanonicalJsonLimitError();
  }
  return json;
}

// No Content-Length trust, parsing, or decoding until the entire bounded body
// is complete. A source may allocate/prefetch chunks independently of this cap.
export async function readCanonicalJson(response: Response): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength > MAX_CANONICAL_JSON_BYTES - length) {
          throw new CanonicalJsonLimitError();
        }
        length += value.byteLength;
        if (value.byteLength) chunks.push(value.slice());
      }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const content: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // Numeric lexical forms may grow when parsed and serialized again.
    encodeCanonicalJson(content);
    return content;
  } catch (error) {
    // Best effort: a rejecting or stalled cancellation must not hide overflow.
    if (reader) void reader.cancel().catch(() => {});
    if (error instanceof CanonicalJsonLimitError) throw error;
    throw new Error("invalid canonical JSON response");
  } finally {
    chunks.length = 0;
    reader?.releaseLock();
  }
}
