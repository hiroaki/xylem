import { structuredLogger } from "@hono/structured-logger";
import type { BaseLogger } from "@hono/structured-logger";

import type { Context, MiddlewareHandler } from "hono";

import { getRootLogger } from "../logging/root-logger.js";
import {
  logAuditByResult,
  resultFromStatus,
} from "../logging/audit-event.js";

type BoundLogger = BaseLogger & {
  child?: (bindings: Record<string, unknown>) => BoundLogger;
};

function bindLogger(
  logger: BaseLogger,
  bindings: Record<string, unknown>,
): BaseLogger {
  const candidate = logger as BoundLogger;
  if (typeof candidate.child === "function") {
    return candidate.child(bindings);
  }

  const mergePayload = (obj: unknown) => {
    if (typeof obj === "object" && obj !== null) {
      return {
        ...bindings,
        ...(obj as Record<string, unknown>),
      };
    }

    return {
      ...bindings,
      value: obj,
    };
  };

  return {
    info: (obj, msg, ...args) => {
      logger.info(mergePayload(obj), msg, ...args);
    },
    warn: (obj, msg, ...args) => {
      logger.warn(mergePayload(obj), msg, ...args);
    },
    error: (obj, msg, ...args) => {
      logger.error(mergePayload(obj), msg, ...args);
    },
    debug: (obj, msg, ...args) => {
      logger.debug(mergePayload(obj), msg, ...args);
    },
  };
}

function createRequestLogger(c: Context) {
  const logger = getRootLogger();

  return bindLogger(logger, {
    service: "xylem",
    request_id: c.var.requestId,
    ...(c.var.clientIp ? { client_ip: c.var.clientIp } : {}),
    method: c.req.method,
    path: c.req.path,
  });
}

export const auditLoggerMiddleware: MiddlewareHandler = structuredLogger({
  createLogger: createRequestLogger,
  onRequest: (logger) => {
    logAuditByResult(logger, "success", {
      timestamp: new Date().toISOString(),
      event: "request_received",
      result: "success",
    });
  },
  onResponse: (logger, c, elapsedMs) => {
    const result = resultFromStatus(c.res.status);

    logAuditByResult(logger, result, {
      timestamp: new Date().toISOString(),
      event: "response_sent",
      result,
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
