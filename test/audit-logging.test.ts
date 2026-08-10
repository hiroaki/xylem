import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseLogger } from "@hono/structured-logger";
import type { Hono } from "hono";
import { createDeleteToken } from "../src/utils/delete-token.js";

type LogEntry = {
  level: "info" | "warn" | "error" | "debug";
  obj: Record<string, unknown>;
  msg?: string;
};

function normalizeLogObject(
  obj: unknown,
): Record<string, unknown> {
  if (typeof obj === "object" && obj !== null) {
    return obj as Record<string, unknown>;
  }

  return {
    value: obj,
  };
}

function createMemoryLogger(entries: LogEntry[]): BaseLogger {
  return {
    info: (obj, msg) => {
      entries.push({
        level: "info",
        obj: normalizeLogObject(obj),
        msg,
      });
    },
    warn: (obj, msg) => {
      entries.push({
        level: "warn",
        obj: normalizeLogObject(obj),
        msg,
      });
    },
    error: (obj, msg) => {
      entries.push({
        level: "error",
        obj: normalizeLogObject(obj),
        msg,
      });
    },
    debug: (obj, msg) => {
      entries.push({
        level: "debug",
        obj: normalizeLogObject(obj),
        msg,
      });
    },
  };
}

function buildUploadFormData(): FormData {
  const formData = new FormData();
  formData.append(
    "file",
    new File(["<gpx></gpx>"], "sample.gpx", {
      type: "application/gpx+xml",
    }),
  );

  return formData;
}

async function setupApp(options?: {
  trustProxy?: boolean;
}): Promise<{
  app: Hono;
  entries: LogEntry[];
}> {
  process.env.ANEMOCHORE_API_URL = "https://anemochore.example";
  process.env.ANEMOCHORE_API_KEY = "TEST_ANEMOCHORE_API_KEY";
  process.env.XYLEM_DELETE_SECRET = "TEST_XYLEM_DELETE_SECRET";
  process.env.XYLEM_TRUST_PROXY =
    options?.trustProxy
      ? "true"
      : "false";
  process.env.XYLEM_TRUSTED_CLIENT_IP_HEADER = "X-Forwarded-For";
  process.env.LOG_LEVEL = "info";

  vi.resetModules();

  const entries: LogEntry[] = [];
  const memoryLogger = createMemoryLogger(entries);

  const { setRootLoggerForTesting } = await import(
    "../src/logging/root-logger.js"
  );
  setRootLoggerForTesting(memoryLogger);

  const { createApp } = await import("../src/app.js");

  return {
    app: createApp(),
    entries,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("audit logging", () => {
  it("records upload rejected failures with failure_reason anemochore_rejected", async () => {
    const { app, entries } = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "unauthorized",
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const res = await app.request(
      "http://localhost/api/upload",
      {
        method: "POST",
        body: buildUploadFormData(),
      },
    );

    expect(res.status).toBe(500);

    const anemochoreEvent = entries.find((entry) =>
      entry.obj.event === "anemochore_upload_requested" &&
      entry.obj.result === "failure"
    );
    const storedEvent = entries.find((entry) =>
      entry.obj.event === "gpx_stored" &&
      entry.obj.result === "failure"
    );
    const responseSentEvent = entries.find((entry) =>
      entry.obj.event === "response_sent" &&
      entry.obj.status === 500 &&
      entry.level === "error"
    );

    expect(anemochoreEvent?.obj.status).toBe(401);
    expect(anemochoreEvent?.obj.failure_reason).toBe("anemochore_rejected");
    expect(storedEvent?.obj.status).toBe(401);
    expect(storedEvent?.obj.failure_reason).toBe("anemochore_rejected");
    expect(responseSentEvent?.obj.error_message).toBe(
      "Anemochore rejected upload request (401)",
    );
    expect(responseSentEvent?.obj.error_message).not.toContain("id or delete_key");
  });

  it("records upload unreachable failures with failure_reason anemochore_unreachable", async () => {
    const { app, entries } = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    const upstreamError = new Error("fetch failed");
    Object.assign(upstreamError, {
      cause: {
        code: "ECONNREFUSED",
      },
    });

    fetchMock.mockRejectedValueOnce(upstreamError);

    const res = await app.request(
      "http://localhost/api/upload",
      {
        method: "POST",
        body: buildUploadFormData(),
      },
    );

    expect(res.status).toBe(500);

    const anemochoreEvent = entries.find((entry) =>
      entry.obj.event === "anemochore_upload_requested" &&
      entry.obj.result === "failure"
    );
    const storedEvent = entries.find((entry) =>
      entry.obj.event === "gpx_stored" &&
      entry.obj.result === "failure"
    );
    const responseEvent = entries.find((entry) =>
      entry.obj.event === "response_sent" &&
      entry.obj.status === 500 &&
      entry.level === "error"
    );

    expect(anemochoreEvent?.obj.failure_reason).toBe("anemochore_unreachable");
    expect(anemochoreEvent?.obj.error_code).toBe("ECONNREFUSED");
    expect(storedEvent?.obj.failure_reason).toBe("anemochore_unreachable");
    expect(storedEvent?.obj.error_code).toBe("ECONNREFUSED");
    expect(responseEvent?.obj.error_message).toContain("ECONNREFUSED");
  });

  it("assigns server-side request IDs and does not accept client-supplied X-Request-Id", async () => {
    const { app, entries } = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response("<gpx></gpx>", {
        status: 200,
      }),
    );

    const res = await app.request(
      "http://localhost/api/gpx/gpx-100",
      {
        method: "GET",
        headers: {
          "X-Request-Id": "spoofed-request-id",
        },
      },
    );

    expect(res.status).toBe(200);

    const requestLog = entries.find((entry) => entry.obj.event === "request_received");
    const routeLog = entries.find((entry) => entry.obj.event === "gpx_retrieval_requested");

    expect(requestLog?.obj.request_id).toBeTypeOf("string");
    expect(requestLog?.obj.request_id).not.toBe("spoofed-request-id");
    expect(requestLog?.obj.request_id).toBe(routeLog?.obj.request_id);
    expect(res.headers.get("X-Request-Id")).toBeNull();
  });

  it("logs failure paths with separate application result and HTTP status", async () => {
    const { app, entries } = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response("upstream unavailable", {
        status: 503,
      }),
    );
    fetchMock.mockRejectedValueOnce(new Error("upstream connection failed"));

    const upstreamFailureResponse = await app.request(
      "http://localhost/api/gpx/gpx-200",
      {
        method: "GET",
      },
    );

    expect(upstreamFailureResponse.status).toBe(503);

    const exceptionResponse = await app.request(
      "http://localhost/api/gpx/gpx-201",
      {
        method: "GET",
      },
    );

    expect(exceptionResponse.status).toBe(500);

    const anemochoreFailure = entries.find((entry) =>
      entry.obj.event === "anemochore_gpx_fetched" &&
      entry.obj.failure_reason === "anemochore_rejected" &&
      entry.obj.result === "failure"
    );
    const anemochoreUnreachable = entries.find((entry) =>
      entry.obj.event === "anemochore_gpx_fetched" &&
      entry.obj.failure_reason === "anemochore_unreachable" &&
      entry.obj.result === "failure"
    );
    const responseSentFromUpstreamFailure = entries.find((entry) =>
      entry.obj.event === "response_sent" &&
      entry.obj.status === 503 &&
      entry.level === "info"
    );
    const responseSentFromException = entries.find((entry) =>
      entry.obj.event === "response_sent" &&
      entry.obj.status === 500 &&
      entry.level === "error"
    );

    expect(anemochoreFailure?.obj.status).toBe(503);
    expect(anemochoreFailure?.obj.failure_reason).toBe("anemochore_rejected");
    expect(anemochoreUnreachable?.obj.error_message).toContain("upstream connection failed");
    expect(responseSentFromUpstreamFailure?.obj.result).toBe("failure");
    expect(responseSentFromException?.obj.result).toBe("failure");
  });

  it("records deletion unreachable failures as anemochore_gpx_deleted failure events", async () => {
    const { app, entries } = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    const upstreamError = new Error("fetch failed");
    Object.assign(upstreamError, {
      code: "ETIMEDOUT",
    });
    fetchMock.mockRejectedValueOnce(upstreamError);

    const deleteToken = await createDeleteToken(
      {
        id: "gpx-401",
        deleteKey: "dk-test",
      },
      "TEST_XYLEM_DELETE_SECRET",
    );

    const res = await app.request(
      "http://localhost/api/gpx/gpx-401",
      {
        method: "DELETE",
        headers: {
          "X-Delete-Token": deleteToken,
        },
      },
    );

    expect(res.status).toBe(500);

    const deletionEvent = entries.find((entry) =>
      entry.obj.event === "anemochore_gpx_deleted" &&
      entry.obj.result === "failure"
    );

    expect(deletionEvent?.obj.failure_reason).toBe("anemochore_unreachable");
    expect(deletionEvent?.obj.error_code).toBe("ETIMEDOUT");
  });

  it("does not write delete tokens or secrets to audit logs", async () => {
    const { app, entries } = await setupApp();

    await app.request(
      "http://localhost/api/gpx/gpx-99",
      {
        method: "DELETE",
        headers: {
          "X-Delete-Token": "SENSITIVE_DELETE_TOKEN",
        },
      },
    );

    const logDump = JSON.stringify(entries);

    expect(logDump).not.toContain("SENSITIVE_DELETE_TOKEN");
    expect(logDump).not.toContain("TEST_ANEMOCHORE_API_KEY");
    expect(logDump).not.toContain("TEST_XYLEM_DELETE_SECRET");
  });

  it("does not blindly trust forwarded IP header unless proxy trust is enabled", async () => {
    const withoutTrustedProxy = await setupApp({ trustProxy: false });
    const noTrustFetchMock = vi.mocked(globalThis.fetch);

    noTrustFetchMock.mockResolvedValueOnce(
      new Response("<gpx></gpx>", {
        status: 200,
      }),
    );

    await withoutTrustedProxy.app.request(
      "http://localhost/api/gpx/gpx-300",
      {
        headers: {
          "X-Forwarded-For": "203.0.113.77",
        },
      },
    );

    const noTrustRequestLog = withoutTrustedProxy.entries.find((entry) =>
      entry.obj.event === "request_received"
    );

    expect(noTrustRequestLog?.obj.client_ip).not.toBe("203.0.113.77");

    const withTrustedProxy = await setupApp({ trustProxy: true });
    const trustFetchMock = vi.mocked(globalThis.fetch);

    trustFetchMock.mockResolvedValueOnce(
      new Response("<gpx></gpx>", {
        status: 200,
      }),
    );

    await withTrustedProxy.app.request(
      "http://localhost/api/gpx/gpx-301",
      {
        headers: {
          "X-Forwarded-For": "203.0.113.77, 10.0.0.10",
        },
      },
    );

    const trustRequestLog = withTrustedProxy.entries.find((entry) =>
      entry.obj.event === "request_received"
    );

    expect(trustRequestLog?.obj.client_ip).toBe("203.0.113.77");
  });

  it("does not emit audit events for static asset requests", async () => {
    const { app, entries } = await setupApp();

    const res = await app.request("http://localhost/index.html");

    expect(res.status).toBe(200);
    expect(entries).toHaveLength(0);
  });
});
