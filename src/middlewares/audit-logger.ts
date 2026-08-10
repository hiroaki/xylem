import { structuredLogger } from "@hono/structured-logger";

import type { Context, MiddlewareHandler } from "hono";

import { rootLogger } from "../logging/root-logger.js";
import { resultFromStatus } from "../logging/audit-event.js";

function createRequestLogger(c: Context) {
  return rootLogger.child({
    service: "xylem",
    request_id: c.var.requestId,
    ...(c.var.clientIp ? { client_ip: c.var.clientIp } : {}),
    method: c.req.method,
    path: c.req.path,
  });
}

export const auditLoggerMiddleware: MiddlewareHandler = structuredLogger({
  createLogger: createRequestLogger,
  onRequest: (logger, c) => {
    logger.info({
      timestamp: new Date().toISOString(),
      event: "request_received",
      result: "success",
    });
  },
  onResponse: (logger, c, elapsedMs) => {
    logger.info({
      timestamp: new Date().toISOString(),
      event: "response_sent",
      result: resultFromStatus(c.res.status),
      status: c.res.status,
      elapsed_ms: elapsedMs,
    });
  },
  onError: (logger, err, c) => {
    logger.error({
      timestamp: new Date().toISOString(),
      event: "response_sent",
      result: "failure",
      status: c.res.status,
      error_message: err.message,
    });
  },
});
