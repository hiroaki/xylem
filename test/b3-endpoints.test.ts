import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalBytes } from "./helpers/canonical-bytes.js";
import { policy } from "./helpers/phase-a.js";

const cap = 10 * 1024 * 1024;
const id = "01234567-0123-4123-8123-0123456789ab";
let app: Hono, cache: string, output: unknown[];
beforeEach(async () => {
  vi.resetModules(); cache = await mkdtemp(join(tmpdir(), "xylem-b3-")); output = [];
  for (const [key, value] of Object.entries({
    ANEMOCHORE_API_URL: "https://storage.example", ANEMOCHORE_API_KEY: "test-key",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example", XYLEM_DELETE_SECRET: "test-secret",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example", LOG_LEVEL: "info", SHARE_CACHE_DIR: cache,
    GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
  })) vi.stubEnv(key, value);
  const record = (...args: unknown[]) => {output.push(args.map(String));};
  vi.spyOn(console, "error").mockImplementation(record);
  const { setRootLoggerForTesting } = await import("../src/logging/root-logger.js");
  setRootLoggerForTesting({info: record, warn: record, error: record, debug: record});
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({id, delete_key: "test-key"}))));
  app = (await import("../src/app.js")).createApp();
});
afterEach(async () => {vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(cache, {recursive: true, force: true});});
function post(path: string, xml = '<gpx><wpt lat="0" lon="0"/></gpx>') {
  const form = new FormData(); form.append("file", new File([xml], "input.gpx"));
  return app.request(`http://localhost/api/${path}`, {method: "POST", body: form});
}

describe("B3 original input preparation", () => {
  it("shares real input preparation and transmits the exact checked JSON string", async () => {
    const process = await import("../src/gpx/process.js");
    const xml = '<gpx><trk><trkseg><trkpt lat="0" lon="0.000001"><time>2026-10-19T00:00:00.1Z</time></trkpt></trkseg></trk></gpx>';
    const prepared = process.prepareCanonicalGpx(process.processGpxInput(xml, policy), policy);
    const preview = await post("normalize", xml); expect(preview.status).toBe(200);
    expect(await preview.text()).toBe(prepared.xml); expect(fetch).not.toHaveBeenCalled();
    expect((await post("upload", xml)).status).toBe(200);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe(prepared.json);
  });
  it.each(["normalize", "upload"])("accepts exact canonical boundary through %s with injected valid processed content", async endpoint => {
    const d = canonicalBytes(cap); const process = await import("../src/gpx/process.js");
    vi.spyOn(process, "processGpxFile").mockResolvedValue(d);
    const result = await post(endpoint); expect(result.status).toBe(200);
    if (endpoint === "upload") expect(vi.mocked(fetch).mock.calls[0]?.[1]?.body).toBe(JSON.stringify(d));
    else {expect(await result.text()).toContain("<time>"); expect(fetch).not.toHaveBeenCalled();}
  });
  it.each(["normalize", "upload"])("rejects +1 before any upstream call through %s", async endpoint => {
    const process = await import("../src/gpx/process.js");
    vi.spyOn(process, "processGpxFile").mockResolvedValue(canonicalBytes(cap + 1));
    const result = await post(endpoint); expect(result.status).toBe(400);
    expect(await result.json()).toEqual({error: "canonical JSON too large"}); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["normalize", "upload"])("keeps internal invariants private for %s", async endpoint => {
    const process = await import("../src/gpx/process.js");
    const d: any = canonicalBytes(256); d.PRIVATE_CANONICAL = "PRIVATE_INVARIANT";
    vi.spyOn(process, "processGpxFile").mockResolvedValue(d);
    const result = await post(endpoint); expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("PRIVATE"); expect(JSON.stringify(output)).not.toContain("PRIVATE");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["normalize", "upload"])("preserves actual raw GPX cap for %s", async endpoint => {
    const result = await post(endpoint, " ".repeat(2097153));
    expect(result.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
});

describe.each(["/api/gpx/", "/s/"])("B3 bounded retrieval %s", path => {
  it("accepts exact 10 MiB with misleading length", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(canonicalBytes(cap)), {headers: {"Content-Length": "999999999"}}));
    const result = await app.request(`http://localhost${path}${id}`);
    expect(result.status).toBe(200); expect((await result.text()).length).toBeGreaterThan(0);
  });
  it.each([undefined, "1", "999999999"])("rejects actual overflow with length=%s and never caches failure", async length => {
    const cancel = vi.fn(() => Promise.reject(new Error("PRIVATE_CANCEL")));
    const body = new ReadableStream<Uint8Array>({start(c) {c.enqueue(new Uint8Array(cap + 1));}, cancel});
    vi.mocked(fetch).mockResolvedValue(new Response(body, {headers: length ? {"Content-Length": length} : {}}));
    const serialize = await import("../src/gpx/serialize.js"); const serializer = vi.spyOn(serialize, "serializeGpx");
    const result = await app.request(`http://localhost${path}${id}`);
    expect(result.status).toBe(502); expect(await result.text()).not.toContain("PRIVATE");
    expect(serializer).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
    expect(await readdir(cache)).toEqual([]); expect(JSON.stringify(output)).not.toContain("PRIVATE");
  });
  it("rejects numeric reserialization growth before derived output", async () => {
    const wire = JSON.stringify(canonicalBytes(cap + 1)).replace("0.000001", "1e-6");
    expect(Buffer.byteLength(wire)).toBeLessThan(cap);
    vi.mocked(fetch).mockResolvedValue(new Response(wire));
    const result = await app.request(`http://localhost${path}${id}`); expect(result.status).toBe(502);
    expect(await readdir(cache)).toEqual([]);
  });
  it("handles malformed in-limit JSON safely, preserving pre-B4 500 mapping", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"PRIVATE_JSON":'));
    const result = await app.request(`http://localhost${path}${id}`);
    expect(result.status).toBe(500); expect(await result.text()).not.toContain("PRIVATE_JSON");
    expect(JSON.stringify(output)).not.toContain("PRIVATE_JSON"); expect(await readdir(cache)).toEqual([]);
  });
});

it("maps overflow for both concurrent share waiters and permits a later successful retry", async () => {
  let release!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => {release = resolve;}));
  const url = `http://localhost/s/${id}`;
  const first = app.request(url), second = app.request(url);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  release(new Response(new Uint8Array(cap + 1)));
  expect((await first).status).toBe(502); expect((await second).status).toBe(502);
  expect(await readdir(cache)).toEqual([]);
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(canonicalBytes(256))));
  expect((await app.request(url)).status).toBe(200); expect(fetch).toHaveBeenCalledTimes(2);
});
