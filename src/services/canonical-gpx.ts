import type { Context } from "hono";
import type { GpxPolicy } from "../policy.js";
import { CanonicalValidationError } from "../gpx/errors.js";
import { assertValidCanonicalGpxDocument } from "../gpx/schema.js";
import { readCanonicalJson, encodeCanonicalJson, CanonicalJsonLimitError, CanonicalJsonResponseError } from "../gpx/json.js";
import { createAnemochoreClient } from "./anemochore.js";
import { emitAuditEvent } from "../logging/audit-event.js";

export const RETRIEVAL_TIMEOUT_MS = 10_000;
export type RetrievalFailure = "invalid_id" | "not_found" | "upstream_http" | "network" | "timeout"
  | "body_read" | "utf8" | "json" | "resource" | "schema";
export class CanonicalRetrievalError extends Error {
  constructor(readonly reason: RetrievalFailure, readonly upstreamStatus?: number) { super("canonical retrieval failed"); }
  get status(): 404 | 502 | 504 {
    return this.reason === "invalid_id" || this.reason === "not_found" ? 404 : this.reason === "timeout" ? 504 : 502;
  }
}
export function assertPublicId(id: string, kind: "gpx" | "share") {
  const valid = kind === "share"
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    : /^[a-zA-Z0-9-]+$/.test(id);
  if (!valid) throw new CanonicalRetrievalError("invalid_id");
}
function discardBody(response: Response) {
  if (response.body) void response.body.cancel().catch(() => {});
}

// The only upstream canonical retrieval operation, shared by both consumers.
export async function retrieveCanonicalGpx(c: Context, id: string, policy: GpxPolicy, kind: "gpx" | "share") {
  assertPublicId(id, kind);
  const client = createAnemochoreClient(c);
  const controller = new AbortController();
  let expired = false;
  let bodyComplete = false;
  let rejectTimeout!: (error: CanonicalRetrievalError) => void;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const deadline = performance.now() + RETRIEVAL_TIMEOUT_MS;
  const expire = () => {
    if (bodyComplete || expired) return;
    expired = true;
    controller.abort();
    rejectTimeout(new CanonicalRetrievalError("timeout"));
  };
  const checkDeadline = () => {
    if (!bodyComplete && performance.now() >= deadline) expire();
    if (expired) throw new CanonicalRetrievalError("timeout");
  };
  const timer = setTimeout(expire, RETRIEVAL_TIMEOUT_MS);
  let response: Response | undefined;
  try {
    const pending = client.getGpx(id, controller.signal);
    // Also dispose of a late response if a transport does not honor abort.
    void pending.then(response => { if (expired) discardBody(response); }, () => {});
    try { response = await Promise.race([pending, timeout]); }
    catch (error) {
      if (error instanceof CanonicalRetrievalError) throw error;
      checkDeadline();
      throw new CanonicalRetrievalError("network");
    }
    checkDeadline();
    if (response.status !== 200) {
      discardBody(response);
      throw new CanonicalRetrievalError(response.status === 404 ? "not_found" : "upstream_http", response.status);
    }
    let canonical: unknown;
    try {
      canonical = await Promise.race([readCanonicalJson(response, {
        signal: controller.signal,
        onBodyComplete() {
          checkDeadline();
          bodyComplete = true;
          clearTimeout(timer);
        },
      }), timeout]);
    } catch (error) {
      checkDeadline();
      if (error instanceof CanonicalJsonLimitError) throw new CanonicalRetrievalError("resource");
      if (error instanceof CanonicalJsonResponseError) throw new CanonicalRetrievalError(error.reason);
      throw error;
    }
    try { assertValidCanonicalGpxDocument(canonical, policy); }
    catch (error) {
      if (error instanceof CanonicalValidationError) {
        throw new CanonicalRetrievalError(error.reason === "resource" ? "resource" : "schema");
      }
      throw error;
    }
    // Validate the fixed schema before recursively serializing upstream objects.
    // Numeric lexical forms can still expand beyond the content cap after parsing.
    try { encodeCanonicalJson(canonical); }
    catch (error) {
      if (error instanceof CanonicalJsonLimitError) throw new CanonicalRetrievalError("resource");
      throw error;
    }
    emitAuditEvent(c, {event: "anemochore_gpx_fetched", result: "success", status: 200, gpx_id: id});
    return canonical;
  } catch (error) {
    if (error instanceof CanonicalRetrievalError) {
      emitAuditEvent(c, {event: "anemochore_gpx_fetched", result: "failure", status: error.upstreamStatus ?? error.status,
        gpx_id: id, failure_reason: error.reason === "network" ? "anemochore_unreachable"
          : error.reason === "upstream_http" ? "anemochore_rejected" : error.reason});
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (expired && response?.body && !response.body.locked) discardBody(response);
  }
}
