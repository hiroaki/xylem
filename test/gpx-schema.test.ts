import { describe, expect, it } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { assertValidCanonicalGpxDocument } from "../src/gpx/schema.js";
import { policy } from "./helpers/phase-a.js";
import { canonicalFixture, invalidTimes, validTimes } from "./helpers/phase-b.js";

// Schema object locations, including fields unused by the current serializer.
const locations = [
  ["envelope", (d: any) => d, ["schema_version", "data_type", "data"]],
  ["data", (d: any) => d.data, ["tracks", "routes", "waypoints"]],
  ["track", (d: any) => d.data.tracks[0], ["segments"]],
  ["segment", (d: any) => d.data.tracks[0].segments[0], ["points"]],
  ["track point", (d: any) => d.data.tracks[0].segments[0].points[0], ["coordinates"]],
  ["route", (d: any) => d.data.routes[0], ["points"]],
  ["route point", (d: any) => d.data.routes[0].points[0], ["coordinates"]],
  ["waypoint", (d: any) => d.data.waypoints[0], ["coordinates"]],
] as const;

describe("complete B1 canonical validation", () => {
  const validate = (value: unknown, limits = policy) => assertValidCanonicalGpxDocument(value, limits);
  const slots = [[], ["data"], ["data", "tracks", 0], ["data", "tracks", 0, "segments", 0], ["data", "tracks", 0, "segments", 0, "points", 0], ["data", "routes", 0], ["data", "routes", 0, "points", 0], ["data", "waypoints", 0]];
  for (const path of slots) {
    it.each([undefined, null, false, 0, "object", []])(`object ${path.join(".") || "envelope"} rejects wrong type %#`, value => {
      const d = canonicalFixture();
      if (path.length === 0) { expect(() => validate(value)).toThrow(); return; }
      const parent = path.slice(0, -1).reduce((v: any, key) => v[key], d);
      parent[path.at(-1)!] = value;
      expect(() => validate(d)).toThrow();
    });
  }
  for (const [label, select, required] of locations) for (const key of required) {
    it.each([undefined, null, false, 0, "invalid", {}])(`${label} rejects wrong required ${key} type %#`, value => {
      const d = canonicalFixture(); select(d)[key] = value; expect(() => validate(d)).toThrow();
    });
  }
  it.each([0, 2, "1", true])("rejects unsupported schema version %s", version => {
    const d: any = canonicalFixture(); d.schema_version = version; expect(() => validate(d)).toThrow();
  });
  it("rejects actual JSON prototype keys without prototype mutation or input repair", () => {
    for (const [, select] of locations) for (const key of ["__proto__", "constructor", "prototype"]) {
      const d = canonicalFixture();
      Object.defineProperty(select(d), key, {value: {polluted: true}, enumerable: true});
      const parsed = JSON.parse(JSON.stringify(d));
      const before = JSON.stringify(parsed);
      expect(() => validate(parsed)).toThrow();
      expect(JSON.stringify(parsed)).toBe(before);
      expect(Object.prototype).not.toHaveProperty("polluted");
    }
  });
  it("rejects misplaced known metadata, sparse points and null/array records", () => {
    for (const [select, key] of [[(d: any) => d.data.tracks[0], "desc"], [(d: any) => d.data.tracks[0].segments[0].points[0], "name"], [(d: any) => d.data.waypoints[0], "time"], [(d: any) => d.data.routes[0], "sym"]] as const) {
      const d = canonicalFixture(); select(d)[key] = "not supported here"; expect(() => validate(d)).toThrow();
    }
    const d = canonicalFixture(); d.data.waypoints = new Array(1); expect(() => validate(d)).toThrow();
  });
  it("accepts the future v1 shape without mutating frozen input", () => {
    const d = canonicalFixture();
    const freeze = (v: any) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
    const before = JSON.stringify(d);
    freeze(d);
    expect(() => validate(d)).not.toThrow();
    expect(JSON.stringify(d)).toBe(before);
  });
  for (const [label, select, required] of locations) {
    it.each(["unknown", "__proto__", "constructor", "prototype"])(`${label} rejects unknown key %s without reading its branch`, key => {
      const d = canonicalFixture();
      Object.defineProperty(select(d), key, { enumerable: true, get() { throw new Error("PRIVATE unknown branch evaluated"); } });
      expect(() => validate(d)).toThrow(/invalid canonical GPX document/);
    });
    it.each(required)(`${label} requires own %s`, key => {
      const d = canonicalFixture();
      delete select(d)[key];
      expect(() => validate(d)).toThrow();
    });
    it(`${label} rejects inherited required fields`, () => {
      const d = canonicalFixture();
      const obj = select(d), key = required[0], value = obj[key];
      delete obj[key];
      Object.setPrototypeOf(obj, { [key]: value });
      expect(() => validate(d)).toThrow();
    });
    it(`${label} rejects an ordinary unknown deeply nested branch`, () => {
      const d = canonicalFixture();
      let branch: any = null;
      for (let i = 0; i < 10000; i++) branch = { next: branch };
      select(d).unknown = branch;
      expect(() => validate(d)).toThrow(/invalid canonical GPX document/);
    });
  }
  const textFields = [
    [(d: any) => d.data.tracks[0], "name", 256], [(d: any) => d.data.routes[0], "name", 256],
    [(d: any) => d.data.waypoints[0], "name", 256], [(d: any) => d.data.routes[0].points[0], "name", 256],
    [(d: any) => d.data.routes[0], "desc", 4096], [(d: any) => d.data.routes[0].points[0], "desc", 4096],
    [(d: any) => d.data.routes[0].points[0], "sym", 128],
  ] as const;
  for (const [index, [select, key, maximum]] of textFields.entries()) {
    it.each([undefined, null, 0, false, [], {}, "", " \t\n", "bad\u0000", "\ud800", "\udfff", "\ufffe", "a".repeat(maximum + 1)])(`text location ${index} rejects invalid ${key} case %#`, value => {
      const d = canonicalFixture(); select(d)[key] = value;
      expect(() => validate(d)).toThrow();
    });
    it.each([maximum - 1, maximum])(`text location ${index} accepts %i code points`, count => {
      const d = canonicalFixture(); select(d)[key] = "😀".repeat(count);
      expect(() => validate(d)).not.toThrow();
    });
    it(`text location ${index} permits omission and preserves legal whitespace/metacharacters`, () => {
      const d = canonicalFixture(); delete select(d)[key]; validate(d);
      select(d)[key] = " \tA\n<&>\u007f😀 ";
      const before = JSON.stringify(d); validate(d); expect(JSON.stringify(d)).toBe(before);
    });
  }
  for (const kind of ["track", "route", "waypoint"] as const) {
    const select = (d: any) => kind === "track" ? d.data.tracks[0].segments[0].points[0] : kind === "route" ? d.data.routes[0].points[0] : d.data.waypoints[0];
    it.each([[], [0], [0, 0, 0, 0], ["0", 0], [null, 0], [true, 0], [{}, 0], [NaN, 0], [Infinity, 0], [0, -Infinity], [180, 0], [-180.001, 0], [0, 90.001], [0, -90.001], [0, 0, null], [0, 0, "0"], [0, 0, NaN], [0, 0, Infinity], [0, 0, 99999.001], [0, 0, -99999.001]])(`${kind} rejects invalid tuple %#`, (...tuple) => {
      const d = canonicalFixture(); select(d).coordinates = tuple; expect(() => validate(d)).toThrow();
    });
    it.each([[-180, -90], [179.99999999999997, 90], [0, -0, 0], [0, 0, -99999], [0, 0, 99999], [1e-7, 0, 1e-7]])(`${kind} accepts valid numeric tuple %#`, (...tuple) => {
      const d = canonicalFixture(); select(d).coordinates = tuple; expect(() => validate(d)).not.toThrow();
    });
  }
  for (const kind of ["track", "route"]) {
    const select = (d: any) => kind === "track" ? d.data.tracks[0].segments[0].points[0] : d.data.routes[0].points[0];
    it.each([...invalidTimes, undefined, null, 0, false, {}])(`${kind} rejects invalid canonical timestamp %#`, value => {
      const d = canonicalFixture(); select(d).time = value; expect(() => validate(d)).toThrow();
    });
    it.each(validTimes.map((value, index) => ({ value, index })))(`${kind} preserves valid timestamp $index`, ({ value }) => {
      const d = canonicalFixture(); select(d).time = value; validate(d); expect(select(d).time).toBe(value);
    });
  }
  it("accepts empty routes beside each actual geometry category, but never empty-route-only input", () => {
    for (const category of ["tracks", "routes", "waypoints"] as const) {
      const d = canonicalFixture();
      for (const other of ["tracks", "routes", "waypoints"] as const) if (other !== category) d.data[other] = [];
      d.data.routes.push({ name: "empty", desc: "retained", points: [] });
      expect(() => validate(d)).not.toThrow();
    }
    expect(() => validate({ schema_version: 1, data_type: "gpx", data: { tracks: [], routes: [{points: []}], waypoints: [] } })).toThrow();
  });
  it("rejects empty segments, and applies all three point/route budgets inclusively", () => {
    const d = canonicalFixture();
    expect(() => validate(d, {...policy, maxTotalPoints: 3, maxRoutes: 1, maxRoutePointsPerRoute: 1})).not.toThrow();
    expect(() => validate(d, {...policy, maxTotalPoints: 2})).toThrow();
    d.data.routes.push({name: "empty", desc: "empty", points: []});
    expect(() => validate(d, {...policy, maxRoutes: 1})).toThrow();
    expect(() => validate(d, {...policy, maxRoutes: 2})).not.toThrow();
    d.data.routes[0].points.push(structuredClone(d.data.routes[0].points[0]));
    expect(() => validate(d, {...policy, maxRoutePointsPerRoute: 1})).toThrow();
    expect(() => validate(d, {...policy, maxRoutePointsPerRoute: 2})).not.toThrow();
    d.data.tracks[0].segments[0].points = [];
    expect(() => validate(d)).toThrow();
  });
  it("enforces default 20/21 routes including empty routes", () => {
    const d = canonicalFixture();
    d.data.routes.push(...Array.from({length: 19}, () => ({name: "empty", desc: "empty", points: []})));
    expect(() => validate(d)).not.toThrow();
    d.data.routes.push({name: "empty", desc: "empty", points: []});
    expect(() => validate(d)).toThrow();
  });
  it("enforces default 100/101 points in a route independently", () => {
    const d = canonicalFixture();
    const point = d.data.routes[0].points[0];
    d.data.routes[0].points = Array.from({length: 100}, () => structuredClone(point));
    expect(() => validate(d)).not.toThrow();
    d.data.routes[0].points.push(structuredClone(point));
    expect(() => validate(d)).toThrow();
  });
  it("enforces default 50000/50001 total validated points across categories", () => {
    const d = canonicalFixture();
    d.data.waypoints = Array.from({length: 49998}, () => ({coordinates: [0, 0], name: "point"}));
    expect(() => validate(d)).not.toThrow();
    d.data.waypoints.push({coordinates: [0, 0], name: "point"});
    expect(() => validate(d)).toThrow();
  });
});

describe("assertValidCanonicalGpxDocument", () => {
  it("accepts a canonicalize() result unchanged", () => {
    const doc = canonicalizeGpx(parseGpxXml(`<?xml version="1.0"?><gpx version="1.1"><wpt lat="1" lon="2" /></gpx>`), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });

    expect(() => assertValidCanonicalGpxDocument(doc, policy)).not.toThrow();
  });

  it("rejects a wrong data_type", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "geojson",
        data: { tracks: [], routes: [], waypoints: [{ coordinates: [1, 2] }] },
      }, policy),
    ).toThrow();
  });

  it("rejects an empty document (no tracks/routes/waypoints)", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [], routes: [], waypoints: [] },
      }, policy),
    ).toThrow();
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [], routes: [], waypoints: [{ coordinates: [200, 2] }] },
      }, policy),
    ).toThrow();
  });

  it("rejects a track with an empty segments array", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [{ segments: [] }], routes: [], waypoints: [] },
      }, policy),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => assertValidCanonicalGpxDocument({}, policy)).toThrow();
    expect(() => assertValidCanonicalGpxDocument(null, policy)).toThrow();
    expect(() => assertValidCanonicalGpxDocument("not an object", policy)).toThrow();
  });
});
