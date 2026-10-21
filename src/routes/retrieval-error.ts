import type { Context } from "hono";
import { CanonicalRetrievalError } from "../services/canonical-gpx.js";
import { emitAuditEvent } from "../logging/audit-event.js";

// Never pass arbitrary exception messages or causes to Hono's global handler.
export function retrievalErrorResponse(c: Context, error: unknown) {
  const status = error instanceof CanonicalRetrievalError ? error.status : 500;
  if (!(error instanceof CanonicalRetrievalError) || error.reason === "invalid_id") {
    emitAuditEvent(c, {event: "gpx_retrieval_failed", result: "failure", status,
      failure_reason: status === 500 ? "retrieval_internal" : "invalid_id"});
  }
  const message = status === 404 ? "Not Found" : status === 502 ? "Bad Gateway"
    : status === 504 ? "Gateway Timeout" : "Internal Server Error";
  return c.json({ error: message }, status);
}
