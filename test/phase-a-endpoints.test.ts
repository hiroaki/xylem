import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { serializeGpx } from "../src/gpx/serialize.js";
import {
  gpx, geometry, invalidCoordinates, invalidElevation, pointKinds, policy, validElevation,
} from "./helpers/phase-a.js";
import {
  bypassCases, invalidDecodedCoordinates, invalidReferences, namespaceSpellings, numericReferences,
} from "./helpers/xml-character-references.js";

let app: Hono;
async function setup(limits: Record<string, string> = {}) {
  const env = {
    ANEMOCHORE_API_URL: "https://storage.example",
    ANEMOCHORE_API_KEY: "test",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example",
    XYLEM_DELETE_SECRET: "test",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example",
    LOG_LEVEL: "silent",
    GPX_MAX_ROUTES: "20",
    GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: String(policy.maxRawBytes),
    XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
    ...limits,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  app = (await import("../src/app.js")).createApp();
}
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn());
  await setup();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(path: string, xml: string) {
  const form = new FormData();
  form.append("file", new File([xml], "input.gpx", { type: "application/gpx+xml" }));
  return app.request("http://localhost/api/" + path, { method: "POST", body: form });
}
async function rejected(xml: string) {
  const preview = await request("normalize", xml);
  const upload = await request("upload", xml);
  expect(preview.status).toBe(400);
  expect(upload.status).toBe(400);
  expect(await preview.json()).toEqual(await upload.json());
  expect(fetch).not.toHaveBeenCalled();
}
async function accepted(xml: string) {
  const preview = await request("normalize", xml);
  expect(preview.status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(
    JSON.stringify({ id: "test-id", delete_key: "test-key" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  const upload = await request("upload", xml);
  expect(upload.status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  expect(url).toBe("https://storage.example/api/upload");
  expect(init?.headers).toMatchObject({ Authorization: "Bearer test", "Content-Type": "application/json" });
  const captured = JSON.parse(String(init?.body));
  expect(await preview.text()).toBe(serializeGpx(captured, policy));
  const body = await upload.json();
  expect(body).toHaveProperty("deleteToken");
  expect(body).not.toHaveProperty("delete_key");
  return captured;
}

describe("Phase A HTTP parity (X06/L05/R01/R03)", () => {
  it.each(bypassCases)("rejects character-reference bypass without storage: $name", async ({ xml }) => {
    await rejected(xml);
  });
  it.each(invalidReferences)("rejects unsafe reference without storage: %s", async reference => {
    await rejected(gpx(`<wpt lat="0" lon="0"/><extensions>${reference}</extensions>`));
  });
  for (const kind of pointKinds) {
    it.each(invalidDecodedCoordinates)(`${kind} rejects decoded invalid coordinates without storage: %s, %s`, async (lat, lon) => {
      await rejected(gpx(geometry(kind, `lat="${numericReferences(lat!)}" lon="${numericReferences(lon!)}"`)
        + '<wpt lat="0" lon="0"/>'));
    });
    it.each(namespaceSpellings)(`${kind} stores decoded namespace/coordinates/elevation: %s`, async uri => {
      const encoded = `<gpx xmlns="${uri}">`
        + geometry(kind, 'lat="&#48;" lon="&#x31;&#x2e;5"', '<ele>&#x30;</ele>') + "</gpx>";
      const captured = await accepted(encoded);
      expect(captured).toEqual(canonicalizeGpx(parseGpxXml(gpx(geometry(kind, 'lat="0" lon="1.5"', '<ele>0</ele>'))), policy));
    });
    it(`${kind} omits decoded invalid optional elevation at both endpoints`, async () => {
      const captured = await accepted(gpx(geometry(kind, undefined, '<ele>&#49;e3</ele>')));
      expect(captured).toEqual(canonicalizeGpx(parseGpxXml(gpx(geometry(kind))), policy));
    });
  }
  for (const kind of pointKinds) {
    it.each(invalidCoordinates)(`${kind} rejects invalid input without storage: %s`, async attributes => {
      await rejected(gpx(geometry(kind, attributes) + '<wpt lat="1" lon="2"/>'));
    });
    it.each([...validElevation, ...invalidElevation])(`${kind} elevation parity: %s`, async value => {
      const xml = gpx(geometry(kind, undefined, `<ele>${value}</ele>`));
      const captured = await accepted(xml);
      // Compare the storage wire representation: JSON represents -0 as 0.
      expect(captured).toEqual(JSON.parse(JSON.stringify(canonicalizeGpx(parseGpxXml(xml), policy))));
    });
    it(`${kind} preserves zero coordinates and first-singleton omission`, async () => {
      const captured = await accepted(gpx(geometry(kind, undefined, "<ele/><ele>2</ele>")));
      const { waypoints, routes, tracks } = captured.data;
      const point = waypoints[0] ?? routes[0]?.points[0] ?? tracks[0]?.segments[0]?.points[0];
      expect(point.coordinates).toEqual([0, 0]);
    });
  }
  it.each([
    '<gpx xmlns="urn:foreign"><wpt lat="0" lon="0"/></gpx>',
    '<gpx><extensions><wpt lat="0" lon="0"/></extensions><wpt lat="1" lon="2"/></gpx>',
    '<gpx><wpt lon="0"><lat>0</lat></wpt></gpx>',
    '<gpx><wpt lat="0" lon="0"/><extensions>&#0;</extensions></gpx>',
    '<gpx><wpt lat="0" lon="0"/><extensions>\u0001</extensions></gpx>',
    '<!DOCTYPE gpx><gpx><wpt lat="0" lon="0"/></gpx>',
    '<gpx><wpt lat="0" lon="0"/></gpx><gpx/>',
  ])("rejects structural/security violations: %s", rejected);
  it("accepts prefixed GPX through both endpoints", async () => {
    await accepted('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:wpt lat="0" lon="0"/></g:gpx>');
  });
  it.each([
    ["GPX_MAX_ROUTES", "1"], ["GPX_MAX_ROUTE_POINTS_PER_ROUTE", "1"],
  ])("injects custom %s into both endpoints", async (name, value) => {
    await setup({ [name]: value });
    await accepted(gpx(geometry("rtept")));
    vi.mocked(fetch).mockClear();
    const body = name === "GPX_MAX_ROUTES"
      ? '<rte/><rte/><wpt lat="0" lon="0"/>'
      : '<rte><rtept lat="0" lon="0"/><rtept lat="1" lon="1"/></rte>';
    await rejected(gpx(body));
  });
  it("accepts default route and per-route equality", async () => {
    await accepted(gpx('<rte/>'.repeat(19) + '<rte>' + '<rtept lat="0" lon="0"/>'.repeat(100) + '</rte>'));
  });
  it.each([
    gpx('<rte/>'.repeat(21) + '<wpt lat="0" lon="0"/>'),
    gpx('<rte>' + '<rtept lat="0" lon="0"/>'.repeat(101) + '</rte>'),
  ])("rejects default route overflow", rejected);
  it("retains raw UTF-8 byte protection at equality and overflow", async () => {
    const xml = gpx('<wpt lat="0" lon="0"/><extensions>日</extensions>');
    await setup({ XYLEM_GPX_MAX_RAW_BYTES: String(Buffer.byteLength(xml)) });
    await accepted(xml);
    vi.mocked(fetch).mockClear();
    await rejected(xml.replace("日", "日日"));
  });
  it("retains encountered total-point protection across categories", async () => {
    await setup({ XYLEM_GPX_MAX_TOTAL_POINTS: "3" });
    const xml = gpx(geometry("wpt") + geometry("rtept") + geometry("trkpt"));
    await accepted(xml);
    vi.mocked(fetch).mockClear();
    await rejected(xml.replace("</gpx>", '<wpt lat="0" lon="0"/></gpx>'));
  });
});
