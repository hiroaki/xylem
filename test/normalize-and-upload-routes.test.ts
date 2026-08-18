import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Hono } from "hono";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

function buildFormData(content: string, filename = "route.gpx"): FormData {
  const formData = new FormData();
  formData.append(
    "file",
    new File([content], filename, { type: "application/gpx+xml" }),
  );
  return formData;
}

async function setupApp(): Promise<Hono> {
  process.env.ANEMOCHORE_API_URL = "https://anemochore.example";
  process.env.ANEMOCHORE_API_KEY = "TEST_ANEMOCHORE_API_KEY";
  process.env.XYLEM_PUBLIC_ORIGIN = "https://gpx.example";
  process.env.XYLEM_DELETE_SECRET = "TEST_XYLEM_DELETE_SECRET";
  process.env.XYLEM_TRUST_PROXY = "false";
  process.env.XYLEM_TRUSTED_CLIENT_IP_HEADER = "X-Forwarded-For";
  process.env.LOG_LEVEL = "silent";

  vi.resetModules();
  const { createApp } = await import("../src/app.js");
  return createApp();
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /api/normalize", () => {
  it("returns GPX XML derived from the canonical pipeline, with metadata stripped", async () => {
    const app = await setupApp();

    const res = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: buildFormData(fixture("sample.gpx")),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/gpx+xml");

    const body = await res.text();
    expect(body).toContain("<trkpt");
    expect(body).toContain("Sample Track");
    expect(body).not.toContain("Someone Private");
    expect(body).not.toContain("GPSWatch");

    // Never reaches Anemochore.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty GPX document with 400", async () => {
    const app = await setupApp();

    const res = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: buildFormData(fixture("empty.gpx")),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid GPX file" });
  });

  it("rejects malformed XML with 400", async () => {
    const app = await setupApp();

    const res = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: buildFormData(fixture("malformed.gpx")),
    });

    expect(res.status).toBe(400);
  });

  it("rejects DOCTYPE-laden input with 400", async () => {
    const app = await setupApp();

    const res = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: buildFormData(fixture("doctype.gpx")),
    });

    expect(res.status).toBe(400);
  });

  it("requires a file", async () => {
    const app = await setupApp();

    const res = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: new FormData(),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/upload", () => {
  it("sends canonicalized JSON to Anemochore rather than the raw file", async () => {
    const app = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "gpx-1", delete_key: "dk-1" }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await app.request("http://localhost/api/upload", {
      method: "POST",
      body: buildFormData(fixture("sample.gpx")),
    });

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.headers).toMatchObject({
      "Content-Type": "application/json",
    });

    const sentBody = JSON.parse(String(requestInit?.body));
    expect(sentBody.schema_version).toBe(1);
    expect(sentBody.data_type).toBe("gpx");
    expect(sentBody.data.tracks[0].name).toBe("Sample Track");
    // Stripped fields must never reach Anemochore either.
    expect(JSON.stringify(sentBody)).not.toContain("Someone Private");
  });

  it("rejects invalid GPX with 400 without calling Anemochore", async () => {
    const app = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);

    const res = await app.request("http://localhost/api/upload", {
      method: "POST",
      body: buildFormData(fixture("empty.gpx")),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid GPX file" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
