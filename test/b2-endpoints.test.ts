import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFixture } from "./helpers/phase-b.js";
import { policy } from "./helpers/phase-a.js";
import { serializeGpx } from "../src/gpx/serialize.js";

let app: Hono;
let logs: unknown[];
beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    ANEMOCHORE_API_URL: "https://storage.example", ANEMOCHORE_API_KEY: "test-key",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example", XYLEM_DELETE_SECRET: "test-secret",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example", LOG_LEVEL: "info",
    GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
  })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({id: "test-id", delete_key: "test-key"}))));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup(limits: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(limits)) vi.stubEnv(key, value);
  logs = [];
  const record = (...args: unknown[]) => {logs.push(args);};
  const { setRootLoggerForTesting } = await import("../src/logging/root-logger.js");
  setRootLoggerForTesting({info: record, warn: record, error: record, debug: record});
  app = (await import("../src/app.js")).createApp();
}
function post(path: string, xml: string) {
  const form = new FormData(); form.append("file", new File([xml], "input.gpx"));
  return app.request(`http://localhost/api/${path}`, {method: "POST", body: form});
}

describe("B2 actual serializer callers", () => {
  it("normalizes tiny coordinates and CR without changing upload input or storage parity", async () => {
    await setup();
    const input = '<gpx><wpt lat="-0.0000001" lon="0.0000001"><ele>0</ele><name>A&#13;B</name></wpt></gpx>';
    const preview = await post("normalize", input);
    expect(preview.status).toBe(200); expect(fetch).not.toHaveBeenCalled();
    const xml = await preview.text();
    expect(xml).toContain('lat="-0.0000001" lon="0.0000001"');
    expect(xml).toContain('<ele>0</ele><name>A&#13;B</name>');
    const upload = await post("upload", input); expect(upload.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(stored.data.waypoints[0]).toEqual({coordinates: [1e-7, -1e-7, 0], name: "A\rB"});
    expect(xml).toBe(serializeGpx(stored, policy));
  });
  it("returns new route metadata and empty routes through the existing public GPX path", async () => {
    await setup({GPX_MAX_ROUTES: "2", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "1", XYLEM_GPX_MAX_TOTAL_POINTS: "3"});
    const d = canonicalFixture(); d.data.routes.push({name: "empty", desc: "empty description", points: []});
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(d)));
    const result = await app.request("http://localhost/api/gpx/test-id");
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("application/gpx+xml; charset=utf-8");
    expect(await result.text()).toBe(serializeGpx(d, {...policy, maxRoutes: 2, maxRoutePointsPerRoute: 1, maxTotalPoints: 3}));
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
  const budgets = [
    {limits: {GPX_MAX_ROUTES: "1"}, mutate: (d: any) => d.data.routes.push({points: []})},
    {limits: {GPX_MAX_ROUTE_POINTS_PER_ROUTE: "1"}, mutate: (d: any) => d.data.routes[0].points.push({...d.data.routes[0].points[0]})},
    {limits: {XYLEM_GPX_MAX_TOTAL_POINTS: "2"}, mutate: (_d: any) => {}},
  ];
  it.each(budgets)("propagates configured retrieval policy case %# (B4 mapping remains pending)", async ({limits, mutate}) => {
    await setup(limits);
    const d = canonicalFixture(); mutate(d);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(d)));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await app.request("http://localhost/api/gpx/test-id");
    // B2 rejects at the serializer; the generic 502 classification belongs to B4.
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({error: "Internal Server Error"});
    expect(String(error.mock.calls[0]?.[1])).toContain("CanonicalValidationError");
  });
  it("keeps an injected normalize invariant failure internal and private", async () => {
    await setup();
    const d: any = canonicalFixture(); d.data.routes[0].points[0].extra = "PRIVATE_B2_INPUT";
    const process = await import("../src/gpx/process.js");
    vi.spyOn(process, "processGpxFile").mockResolvedValue(d);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post("normalize", '<gpx><wpt lat="0" lon="0"/></gpx>');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({error: "Internal Server Error"});
    expect(fetch).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[1])).toContain("GPX processing failed");
    expect(String(error.mock.calls[0]?.[1])).not.toContain("PRIVATE_B2_INPUT");
    expect(JSON.stringify(logs)).not.toContain("PRIVATE_B2_INPUT");
  });
});
