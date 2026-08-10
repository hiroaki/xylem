import type { Context } from "hono";

export type AuditResult = "success" | "failure";
export type AuditFailureReason =
  | "anemochore_rejected"
  | "anemochore_unreachable";

type AuditEventPayload = {
  event: string;
  result: AuditResult;
  status?: number;
  gpx_id?: string;
  failure_reason?: AuditFailureReason;
  error_message?: string;
  error_code?: string;
};

export function emitAuditEvent(
  c: Context,
  payload: AuditEventPayload,
): void {
  c.var.logger.info({
    timestamp: new Date().toISOString(),
    event: payload.event,
    result: payload.result,
    ...(payload.status !== undefined
      ? { status: payload.status }
      : {}),
    ...(payload.gpx_id !== undefined
      ? { gpx_id: payload.gpx_id }
      : {}),
    ...(payload.failure_reason !== undefined
      ? { failure_reason: payload.failure_reason }
      : {}),
    ...(payload.error_message !== undefined
      ? { error_message: payload.error_message }
      : {}),
    ...(payload.error_code !== undefined
      ? { error_code: payload.error_code }
      : {}),
  });
}

export function resultFromStatus(status: number): AuditResult {
  return status >= 400
    ? "failure"
    : "success";
}
