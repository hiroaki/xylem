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

// Expected external failures only; unexpected implementation errors stay internal.
export class CanonicalJsonResponseError extends Error {
  constructor(readonly reason: "body_read" | "utf8" | "json") {
    super("invalid canonical JSON response");
  }
}

export type CanonicalReadOptions = {
  signal?: AbortSignal;
  // Called after bounded body assembly, before decoding/parsing.
  onBodyComplete?: () => void;
};

// Count actual bytes independently of Content-Length; retain no overflow chunk.
export async function readCanonicalJson(response: Response, options: CanonicalReadOptions = {}): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const chunks: Uint8Array[] = [];
  let length = 0;
  const { signal } = options;
  let rejectAbort: ((error: Error) => void) | undefined;
  let cancelled = false;
  const cancelReader = () => {
    if (reader && !cancelled) {
      cancelled = true;
      // A rejecting or stalled cancel never delays the original result.
      void reader.cancel().catch(() => {});
    }
  };
  const onAbort = () => {
    cancelReader();
    rejectAbort?.(new CanonicalJsonResponseError("body_read"));
  };
  try {
    if (signal?.aborted) throw new CanonicalJsonResponseError("body_read");
    reader = response.body?.getReader();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (reader) {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          const pending = reader.read();
          // Keep just the active read's reject callback, rather than attaching
          // every chunk to one pending abort promise for the entire response.
          chunk = await (signal ? new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
            rejectAbort = reject;
            void pending.then(resolve, reject);
          }) : pending);
        } catch { throw new CanonicalJsonResponseError("body_read"); }
        finally { rejectAbort = undefined; }
        if (signal?.aborted) throw new CanonicalJsonResponseError("body_read");
        const { done, value } = chunk;
        if (done) break;
        if (value.byteLength > MAX_CANONICAL_JSON_BYTES - length) throw new CanonicalJsonLimitError();
        length += value.byteLength;
        if (value.byteLength) chunks.push(value.slice());
      }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    options.onBodyComplete?.();
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (error) {
      if (error instanceof TypeError) throw new CanonicalJsonResponseError("utf8");
      throw error;
    }
    let content: unknown;
    try { content = JSON.parse(text); }
    catch (error) {
      if (error instanceof SyntaxError) throw new CanonicalJsonResponseError("json");
      throw error;
    }
    return content;
  } catch (error) {
    cancelReader();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    chunks.length = 0;
    reader?.releaseLock();
  }
}
