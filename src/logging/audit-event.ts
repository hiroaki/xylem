import type { Context } from "hono";

export type AuditResult = "success" | "failure";

type AuditEventPayload = {
  event: string;
  result: AuditResult;
  status?: number;
  gpx_id?: string;
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
  });
}

export function resultFromStatus(status: number): AuditResult {
  return status >= 400
    ? "failure"
    : "success";
}
