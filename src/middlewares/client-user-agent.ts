import { createHash } from "node:crypto";

import type { MiddlewareHandler } from "hono";

const MAX_LOG_BYTES = 512;

export function encodeUserAgent(userAgent: string): string {
  const encoded: string[] = [];

  for (const byte of Buffer.from(userAgent, "latin1")) {
    if (byte >= 0x20 && byte <= 0x7e) {
      const char = String.fromCharCode(byte);

      if (char === "%") {
        encoded.push("%25");
      } else {
        encoded.push(char);
      }

      continue;
    }

    encoded.push(`%${byte.toString(16).toUpperCase().padStart(2, "0")}`);
  }

  return encoded.join("");
}

export function truncateEncodedUserAgent(encoded: string): string {
  const result = [];
  let byteLength = 0;

  for (let index = 0; index < encoded.length;) {
    let token;

    if (encoded[index] === "%") {
      token = encoded.slice(index, index + 3);
    } else {
      token = encoded[index];
    }

    const tokenByteLength = Buffer.byteLength(token, "utf8");

    if (byteLength + tokenByteLength > MAX_LOG_BYTES) {
      break;
    }

    result.push(token);
    byteLength += tokenByteLength;
    index += token.length;
  }

  return result.join("");
}

export function normalizeUserAgent(userAgent: string) {
  // HTTP header values are treated as a one-byte string.
  // Preserve those raw byte values when reconstructing the input bytes.
  const rawBytes = Buffer.from(userAgent, "latin1");
  const encoded = encodeUserAgent(userAgent);
  const normalized = truncateEncodedUserAgent(encoded);

  return {
    value: normalized,
    truncated: normalized !== encoded,
    sha256: createHash("sha256")
      .update(rawBytes)
      .digest("hex"),
    rawLength: rawBytes.length,
  };
}

export const clientUserAgentMiddleware: MiddlewareHandler = (async (
  c,
  next,
) => {
  const userAgent = c.req.header("User-Agent");

  if (userAgent) {
    const normalized = normalizeUserAgent(userAgent);

    c.set("userAgent", normalized.value);
    c.set("userAgentTruncated", normalized.truncated);
    c.set("userAgentSha256", normalized.sha256);
    c.set("userAgentRawLength", normalized.rawLength);
  } else {
    c.set("userAgent", undefined);
    c.set("userAgentTruncated", undefined);
    c.set("userAgentSha256", undefined);
    c.set("userAgentRawLength", undefined);
  }

  await next();
});
