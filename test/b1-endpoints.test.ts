import { policy } from "./helpers/phase-a.js";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeGpx } from "../src/gpx/serialize.js";
import { invalidTimes, validTimes } from "./helpers/phase-b.js";

let app: Hono;
let logs: unknown[];
beforeEach(async () => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    ANEMOCHORE_API_URL: "https://storage.example", ANEMOCHORE_API_KEY: "test-key",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example", XYLEM_DELETE_SECRET: "test-secret",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example", LOG_LEVEL: "info",
    GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
    XYLEM_GPX_MAX_NAME_LENGTH: "1", // Retired: must not affect any name.
  })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({id: "test-id", delete_key: "delete-key"}))));
  logs = [];
  const record = (...args: unknown[]) => { logs.push(args); };
  const { setRootLoggerForTesting } = await import("../src/logging/root-logger.js");
  setRootLoggerForTesting({info: record, warn: record, error: record, debug: record});
  app = (await import("../src/app.js")).createApp();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function request(path: string, xml: string) {
  const form = new FormData();
  form.append("file", new File([xml], "input.gpx"));
  return app.request(`http://localhost/api/${path}`, {method: "POST", body: form});
}

async function accepted(xml: string) {
  const preview = await request("normalize", xml);
  expect(preview.status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
  const upload = await request("upload", xml);
  expect(upload.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  const canonical = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
  expect(await preview.text()).toBe(serializeGpx(canonical, policy));
  return canonical;
}

describe("B1 actual normalize/upload input boundary", () => {
  it.each([255, 256, 257])("uses shared names at %i code points for every existing name", async count => {
    const raw = "😀".repeat(count);
    const expected = count > 256 ? "😀".repeat(255) + "…" : raw;
    const d = await accepted(`<gpx><trk><name> ${raw} </name><trkseg><trkpt lat="0" lon="0"/></trkseg></trk><rte><name> ${raw} </name><rtept lat="0" lon="0"/></rte><wpt lat="0" lon="0"><name> ${raw} </name></wpt></gpx>`);
    expect(d.data.tracks[0].name).toBe(expected);
    expect(d.data.routes[0].name).toBe(expected);
    expect(d.data.waypoints[0].name).toBe(expected);
  });
  it.each(validTimes.map((value, index) => ({value, index})))("preserves valid time $index without conversion", async ({value}) => {
    const d = await accepted(`<gpx><trk><trkseg><trkpt lat="0" lon="0"><time> ${value} </time></trkpt></trkseg></trk></gpx>`);
    expect(d.data.tracks[0].segments[0].points[0].time).toBe(value);
  });
  it.each(invalidTimes.filter(value => value.trim() === value).map((value, index) => ({value, index})))("omits invalid first time $index, never falling back", async ({value}) => {
    const d = await accepted(`<gpx><trk><trkseg><trkpt lat="0" lon="0"><time>${value}</time><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`);
    expect(d.data.tracks[0].segments[0].points[0]).not.toHaveProperty("time");
  });
  it("preserves legal text and first-singleton/structured omission alongside B5 metadata", async () => {
    const d = await accepted('<gpx><trk><name> </name><name>fallback</name><trkseg><trkpt lat="0" lon="0"><name>not retained</name><time><nested/></time><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk><rte><name> A\u007f\tB\nC &amp; &lt;D&gt; </name><desc>future</desc><rtept lat="0" lon="0"><name>future</name><sym>Flag</sym></rtept></rte><rte/><wpt lat="0" lon="0"><name><nested/></name><name>fallback</name></wpt></gpx>');
    expect(d.data.tracks[0]).not.toHaveProperty("name");
    expect(d.data.tracks[0].segments[0].points[0]).toEqual({coordinates: [0, 0]});
    expect(d.data.routes).toEqual([{name: "A\u007f\tB\nC & <D>", desc: "future", points: [{coordinates: [0, 0], name: "future", sym: "Flag"}]}, {points: []}]);
    expect(d.data.waypoints[0]).not.toHaveProperty("name");
  });
  it.each(["\u0000", "\ud800", "&#xB;", "&#xD800;"])("rejects invalid XML text %# safely with zero storage calls", async invalid => {
    // UTF-8 File encoding replaces literal lone surrogates, so use an illegal
    // numeric reference for that case to exercise the actual XML rejection.
    const text = invalid === "\ud800" ? "&#xD800;" : invalid;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateText = "PRIVATE_B1_INVALID_XML";
    for (const path of ["normalize", "upload"]) {
      const response = await request(path, `<gpx><wpt lat="0" lon="0"><name>${privateText}${"a".repeat(300)}${text}</name></wpt></gpx>`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({error: "invalid GPX file"});
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(JSON.stringify(logs)).not.toContain(privateText);
  });
  it("classifies actual post-normalization schema failures as private internal 500s", async () => {
    const privateText = "PRIVATE_B1_CANONICALIZER_BUG";
    const module = await import("../src/gpx/canonicalize.js");
    vi.spyOn(module, "canonicalizeGpx").mockReturnValue({
      schema_version: 1, data_type: "gpx",
      data: {tracks: [], routes: [], waypoints: [{coordinates: [0, 0], name: privateText, extra: privateText}]},
    } as any);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["normalize", "upload"]) {
      const response = await request(path, '<gpx><wpt lat="0" lon="0"/></gpx>');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({error: "Internal Server Error"});
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(2);
    for (const call of consoleError.mock.calls) {
      expect(String(call[1])).toContain("GPX processing failed");
      expect(String(call[1])).not.toContain(privateText);
    }
    expect(JSON.stringify(logs)).not.toContain(privateText);
  });
});
