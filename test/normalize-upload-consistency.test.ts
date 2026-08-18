import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Hono } from "hono";
import { canonicalizeGpx } from "../src/gpx/canonicalize.js";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

function buildFormData(content: string): FormData {
  const formData = new FormData();
  formData.append(
    "file",
    new File([content], "route.gpx", { type: "application/gpx+xml" }),
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

describe("normalize/upload canonicalization consistency", () => {
  it("produces the same canonical data via /api/normalize's output and /api/upload's Anemochore payload", async () => {
    const app = await setupApp();
    const fetchMock = vi.mocked(globalThis.fetch);
    const gpxText = fixture("sample.gpx");

    // What /api/normalize would show the user, re-canonicalized (as a browser
    // re-parsing the returned GPX through Tilia effectively "sees").
    const normalizeResponse = await app.request("http://localhost/api/normalize", {
      method: "POST",
      body: buildFormData(gpxText),
    });
    const normalizedGpxXml = await normalizeResponse.text();
    const reCanonicalizedFromPreview = canonicalizeGpx(normalizedGpxXml);

    // What /api/upload actually sends to Anemochore for storage.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "gpx-1", delete_key: "dk-1" }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    await app.request("http://localhost/api/upload", {
      method: "POST",
      body: buildFormData(gpxText),
    });
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const sentToAnemochore = JSON.parse(String(requestInit?.body));

    expect(sentToAnemochore).toEqual(reCanonicalizedFromPreview);
  });
});
