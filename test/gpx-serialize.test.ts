import { describe, expect, it, vi } from "vitest";
import { parseXml, XmlElement, XmlText } from "@rgrove/parse-xml";
import { CanonicalValidationError } from "../src/gpx/errors.js";
import { processGpxInput } from "../src/gpx/process.js";
import { policy } from "./helpers/phase-a.js";
import { canonicalFixture, validTimes } from "./helpers/phase-b.js";
import * as decimal from "../src/gpx/decimal.js";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { serializeGpx } from "../src/gpx/serialize.js";
import type { CanonicalGpxDocument } from "../src/gpx/canonicalize.js";

describe("serializeGpx", () => {
  it("preserves tracks, segments, points, elevation, timestamp, and waypoint name", () => {
    const document: CanonicalGpxDocument = {
      schema_version: 1,
      data_type: "gpx",
      data: {
        tracks: [
          {
            name: "Sample Track",
            segments: [
              {
                points: [
                  { coordinates: [135.2, 35.2, 120.5], time: "2024-01-01T00:10:00Z" },
                  { coordinates: [135.1, 35.1] },
                ],
              },
            ],
          },
        ],
        routes: [],
        waypoints: [{ coordinates: [135.01, 35.01, 10.5], name: "Start marker" }],
      },
    };

    const xml = serializeGpx(document, policy);

    expect(xml).toContain('<trkpt lat="35.2" lon="135.2">');
    expect(xml).toContain("<ele>120.5</ele>");
    expect(xml).toContain("<time>2024-01-01T00:10:00Z</time>");
    expect(xml).toContain('<trkpt lat="35.1" lon="135.1">');
    expect(xml).toContain('<wpt lat="35.01" lon="135.01">');
    expect(xml).toContain("<name>Start marker</name>");

    const reCanonicalized = canonicalizeGpx(parseGpxXml(xml), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });
    expect(reCanonicalized.data.tracks[0]?.segments[0]?.points).toHaveLength(2);
  });

  it("escapes special characters in names instead of producing injectable XML", () => {
    const document: CanonicalGpxDocument = {
      schema_version: 1,
      data_type: "gpx",
      data: {
        tracks: [],
        routes: [],
        waypoints: [
          { coordinates: [135, 35], name: 'Tom & Jerry <script>]]></wpt>' },
        ],
      },
    };

    const xml = serializeGpx(document, policy);

    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("]]></wpt>");
    expect(xml).toContain("Tom &amp; Jerry &lt;script&gt;");

    const reCanonicalized = canonicalizeGpx(parseGpxXml(xml), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });
    expect(reCanonicalized.data.waypoints[0]?.name).toBe(
      "Tom & Jerry <script>]]></wpt>",
    );
  });

  it("does not restore fields stripped during canonicalization", () => {
    const document: CanonicalGpxDocument = {
      schema_version: 1,
      data_type: "gpx",
      data: {
        tracks: [{ segments: [{ points: [{ coordinates: [135, 35] }] }] }],
        routes: [],
        waypoints: [],
      },
    };

    const xml = serializeGpx(document, policy);

    expect(xml).not.toContain("<author");
    expect(xml).not.toContain("<extensions");
    expect(xml).not.toContain("<desc");
    expect(xml).not.toContain("<creator");
  });
});

const elements = (node: XmlElement) => node.children.filter((child): child is XmlElement => child instanceof XmlElement);
const child = (node: XmlElement, name: string) => elements(node).find(element => element.name === name)!;
const text = (node: XmlElement) => node.children.map(value => value instanceof XmlText ? value.text : "").join("");
const root = (d: unknown) => parseXml(serializeGpx(d, policy)).root!;

// B5 ingestion is deliberately not used to verify future route metadata.
describe("B2 complete canonical output", () => {
  for (const kind of ["wpt", "rtept", "trkpt"] as const) {
    const select = (d: any) => kind === "wpt" ? d.data.waypoints[0] : kind === "rtept" ? d.data.routes[0].points[0] : d.data.tracks[0].segments[0].points[0];
    const xmlSelect = (r: XmlElement) => kind === "wpt" ? child(r, "wpt") : kind === "rtept" ? child(child(r, "rte"), "rtept") : child(child(child(r, "trk"), "trkseg"), "trkpt");
    it.each([0, -0, 1e-7, -1e-7, Number.MIN_VALUE, -Number.MIN_VALUE, 1.2345678901234567e-7, 90, -90])(`${kind} uses value-preserving ordinary decimal for every numeric property %#`, value => {
      const d = canonicalFixture(); select(d).coordinates = [value, value, value];
      const point = xmlSelect(root(d));
      const numeric = [point.attributes.lon, point.attributes.lat, text(child(point, "ele"))];
      for (const spelling of numeric) {
        expect(spelling).not.toMatch(/[eE]/);
        expect(Number(spelling)).toBe(value === 0 ? 0 : value);
      }
    });
    it(`${kind} omits absent elevation but retains numeric zero and approved elevation bounds`, () => {
      const d = canonicalFixture(); select(d).coordinates = [1, 2];
      expect(child(xmlSelect(root(d)), "ele")).toBeUndefined();
      for (const value of [0, -0, -99999, 99999]) {
        select(d).coordinates = [1, 2, value];
        expect(Number(text(child(xmlSelect(root(d)), "ele")))).toBe(value === 0 ? 0 : value);
      }
    });
  }
  it("validates the entire document before formatting any output", () => {
    const d = canonicalFixture(); d.data.routes[0].points[0].desc = "\u0001PRIVATE";
    const formatter = vi.spyOn(decimal, "formatDecimal");
    try {
      expect(() => serializeGpx(d, policy)).toThrow(CanonicalValidationError);
      expect(formatter).not.toHaveBeenCalled();
    } finally { formatter.mockRestore(); }
  });
  const locations = [
    [(d: any) => d.data.tracks[0], (r: XmlElement) => child(r, "trk"), "name"],
    [(d: any) => d.data.routes[0], (r: XmlElement) => child(r, "rte"), "name"],
    [(d: any) => d.data.routes[0], (r: XmlElement) => child(r, "rte"), "desc"],
    [(d: any) => d.data.routes[0].points[0], (r: XmlElement) => child(child(r, "rte"), "rtept"), "name"],
    [(d: any) => d.data.routes[0].points[0], (r: XmlElement) => child(child(r, "rte"), "rtept"), "desc"],
    [(d: any) => d.data.routes[0].points[0], (r: XmlElement) => child(child(r, "rte"), "rtept"), "sym"],
    [(d: any) => d.data.waypoints[0], (r: XmlElement) => child(r, "wpt"), "name"],
  ] as const;
  for (const [index, [select, xmlSelect, field]] of locations.entries()) {
    it.each(['& < > " \'', ']]></name><script>alert(1)</script>', '&#13; &#xD; &amp; &unknown;', '日本😀e\u0301👩‍💻\u007f', 'A\rB', 'A\r\nB', 'A\nB', ' \tA\tB\nC '])(`text location ${index} preserves exact XML value %#`, value => {
      const d = canonicalFixture(); select(d)[field] = value;
      const before = JSON.stringify(d);
      expect(text(child(xmlSelect(root(d)), field))).toBe(value);
      expect(JSON.stringify(d)).toBe(before);
    });
    const max = field === 'desc' ? 4096 : field === 'sym' ? 128 : 256;
    it(`text location ${index} retains maximum code points without another ellipsis`, () => {
      const d = canonicalFixture(); const value = '😀'.repeat(max - 1) + '…'; select(d)[field] = value;
      expect(text(child(xmlSelect(root(d)), field))).toBe(value);
    });
    it.each([null, undefined, false, 1, {}, [], '', ' \t\n', '\u0000', '\u000b', '\ud800', '\udfff', '\ufffe', 'a'.repeat(max + 1)])(`text location ${index} rejects invalid field %#`, value => {
      const d = canonicalFixture(); select(d)[field] = value;
      expect(() => serializeGpx(d, policy)).toThrow(CanonicalValidationError);
    });
  }
  it("preserves route metadata, point order, duplicate coordinates and GPX element order", () => {
    const d = canonicalFixture();
    d.data.routes[0].points[0].coordinates = [12, 34, 0];
    d.data.routes[0].points.push({...d.data.routes[0].points[0], name: "second"});
    d.data.routes.unshift({name: "empty", desc: "empty description", points: []});
    const r = root(d);
    expect(r.name).toBe("gpx");
    expect(r.attributes).toMatchObject({version: "1.1", creator: "Xylem", xmlns: "http://www.topografix.com/GPX/1/1"});
    expect(elements(r).map(v => v.name)).toEqual(["wpt", "rte", "rte", "trk"]);
    const routes = elements(r).filter(v => v.name === "rte");
    expect(elements(routes[0]).map(v => v.name)).toEqual(["name", "desc"]);
    expect(text(child(routes[0], "name"))).toBe("empty");
    expect(text(child(routes[0], "desc"))).toBe("empty description");
    expect(elements(routes[1]).map(v => v.name)).toEqual(["name", "desc", "rtept", "rtept"]);
    const points = elements(routes[1]).filter(v => v.name === "rtept");
    expect(points.map(v => v.attributes)).toEqual([{lat: "34", lon: "12"}, {lat: "34", lon: "12"}]);
    for (const point of points) expect(elements(point).map(v => v.name)).toEqual(["ele", "time", "name", "desc", "sym"]);
    expect(points.map(v => text(child(v, "name")))).toEqual(["Point", "second"]);
    expect(text(child(points[0], "ele"))).toBe("0");
    expect(text(child(points[0], "desc"))).toBe("Details");
    expect(text(child(points[0], "sym"))).toBe("Flag");
    expect(text(child(points[0], "time"))).toBe(d.data.routes[1].points[0].time);
  });
  it.each(validTimes.map((value, index) => ({value, index})))("preserves both supported time strings $index", ({value}) => {
    const d = canonicalFixture();
    d.data.tracks[0].segments[0].points[0].time = value; d.data.routes[0].points[0].time = value;
    const r = root(d);
    expect(text(child(child(child(child(r, "trk"), "trkseg"), "trkpt"), "time"))).toBe(value);
    expect(text(child(child(child(r, "rte"), "rtept"), "time"))).toBe(value);
  });
  it("keeps original reference-produced CR through canonical and XML round trips", () => {
    const d = processGpxInput('<gpx><wpt lat="0" lon="1"><name>A&#13;B</name></wpt></gpx>', policy);
    expect(d.data.waypoints[0].name).toBe("A\rB");
    const xml = serializeGpx(d, policy);
    expect(xml).toContain("A&#13;B");
    expect(processGpxInput(xml, policy)).toEqual(d);
  });
  it("preserves frozen valid input and geometry boundaries", () => {
    const d = canonicalFixture();
    const freeze = (v: any) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
    const before = JSON.stringify(d); freeze(d);
    expect(() => root(d)).not.toThrow(); expect(JSON.stringify(d)).toBe(before);
  });
  it.each(["tracks", "routes", "waypoints"] as const)("keeps named/unnamed empty routes beside %s without fabricating points", category => {
    const d: any = canonicalFixture();
    for (const other of ["tracks", "routes", "waypoints"]) if (other !== category) d.data[other] = [];
    d.data.routes.push({points: []}, {name: "empty", points: []});
    const routes = elements(root(d)).filter(value => value.name === "rte");
    expect(elements(routes.at(-2)!)).toEqual([]);
    expect(elements(routes.at(-1)!).map(value => value.name)).toEqual(["name"]);
    expect(text(child(routes.at(-1)!, "name"))).toBe("empty");
  });
  it("omits all absent optional metadata rather than emitting empty elements", () => {
    const d: any = canonicalFixture();
    delete d.data.tracks[0].name;
    delete d.data.tracks[0].segments[0].points[0].time;
    delete d.data.routes[0].name; delete d.data.routes[0].desc;
    for (const key of ["name", "desc", "sym", "time"]) delete d.data.routes[0].points[0][key];
    delete d.data.waypoints[0].name;
    const xml = serializeGpx(d, policy);
    expect(xml).not.toMatch(/<(?:name|desc|sym|time)>/);
    expect(elements(root(d)).map(value => value.name)).toEqual(["wpt", "rte", "trk"]);
  });
  for (const [index, select] of [
    (d: any) => d, (d: any) => d.data, (d: any) => d.data.tracks[0],
    (d: any) => d.data.tracks[0].segments[0], (d: any) => d.data.tracks[0].segments[0].points[0],
    (d: any) => d.data.routes[0], (d: any) => d.data.routes[0].points[0], (d: any) => d.data.waypoints[0],
  ].entries()) {
    it(`rejects unknown branch at level ${index} before output/branch access`, () => {
      const d = canonicalFixture(); const accessed = vi.fn(() => {throw new Error("PRIVATE");});
      Object.defineProperty(select(d), "unknown", {enumerable: true, get: accessed});
      expect(() => serializeGpx(d, policy)).toThrow(CanonicalValidationError);
      expect(accessed).not.toHaveBeenCalled();
    });
  }
  const invalid = [
    (d: any) => { d.schema_version = 2; }, (d: any) => {d.data_type = "geojson";},
    (d: any) => {delete d.data.waypoints;}, (d: any) => {d.data.tracks = null;},
    (d: any) => {d.data.tracks[0].segments = [];}, (d: any) => {d.data.tracks[0].segments[0].points = [];},
    (d: any) => {d.data.routes[0].points[0].time = "0000-01-01T00:00:00Z";},
    (d: any) => {d.data.tracks[0].segments[0].points[0].time = "2025-02-30T00:00:00Z";},
    ...[[180, 0], [0, 91], [NaN, 0], [0, Infinity], ["0", 0], [0, 0, null], [0, 0, 100000], [0, 0, -100000], [0], [0, 0, 0, 0]].map(value => (d: any) => {d.data.waypoints[0].coordinates = value;}),
  ];
  it.each(invalid)("rejects invalid canonical case %# without mutation or input-error classification", mutate => {
    const d = canonicalFixture(); mutate(d); const before = JSON.stringify(d);
    expect(() => serializeGpx(d, policy)).toThrow(CanonicalValidationError);
    expect(JSON.stringify(d)).toBe(before);
  });
  it.each([null, undefined, [], 0, "gpx"])("rejects invalid envelope %# with the canonical exception", value => {
    expect(() => serializeGpx(value, policy)).toThrow(CanonicalValidationError);
  });
  it("applies explicit point and route budgets and rejects geometry-free input", () => {
    const d = canonicalFixture();
    expect(() => serializeGpx(d, {...policy, maxTotalPoints: 3, maxRoutes: 1, maxRoutePointsPerRoute: 1})).not.toThrow();
    expect(() => serializeGpx(d, {...policy, maxTotalPoints: 2})).toThrow(CanonicalValidationError);
    d.data.routes.push({name: "empty", desc: "empty", points: []});
    expect(() => serializeGpx(d, {...policy, maxRoutes: 1})).toThrow(CanonicalValidationError);
    d.data.routes[0].points.push({...d.data.routes[0].points[0]});
    expect(() => serializeGpx(d, {...policy, maxRoutePointsPerRoute: 1})).toThrow(CanonicalValidationError);
    expect(() => serializeGpx({schema_version: 1, data_type: "gpx", data: {tracks: [], routes: [{points: []}], waypoints: []}}, policy)).toThrow(CanonicalValidationError);
  });
  it("serializes tiny canonical elevation without changing the separate input precision policy", () => {
    const d = {schema_version: 1, data_type: "gpx", data: {tracks: [], routes: [], waypoints: [{coordinates: [1e-7, -1e-7, 1e-7]}]}};
    const xml = serializeGpx(d, policy);
    expect(xml).toContain('lat="-0.0000001" lon="0.0000001"');
    expect(xml).toContain('<ele>0.0000001</ele>');
    expect(processGpxInput(xml, policy).data.waypoints[0].coordinates).toEqual([1e-7, -1e-7]);
  });
});
