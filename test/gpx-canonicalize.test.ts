import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { assertSafeGpxXml } from "../src/gpx/xml-security-filter.js";
import { processGpxInput } from "../src/gpx/process.js";
import { policy } from "./helpers/phase-a.js";
import { validTimes, invalidTimes } from "./helpers/phase-b.js";

describe("B1 currently supported name/time ingestion", () => {
  const entities = [
    ["track", (text: string) => `<trk><name>${text}</name><trkseg><trkpt lat="0" lon="0"/></trkseg></trk>`, (d: any) => d.data.tracks[0]],
    ["route", (text: string) => `<rte><name>${text}</name><rtept lat="0" lon="0"/></rte>`, (d: any) => d.data.routes[0]],
    ["waypoint", (text: string) => `<wpt lat="0" lon="0"><name>${text}</name></wpt>`, (d: any) => d.data.waypoints[0]],
  ] as const;
  for (const [kind, xml, select] of entities) {
    it.each([255, 256, 257])(`${kind} normalizes %i code points without splitting pairs`, count => {
      const name = "😀".repeat(count);
      const d = processGpxInput(`<gpx>${xml("  " + name + "  ")}</gpx>`, policy);
      expect(select(d).name).toBe(count > 256 ? "😀".repeat(255) + "…" : name);
    });
    it(`${kind} preserves legal DEL/internal whitespace and omits first blank/structured singleton`, () => {
      const normalize = (text: string) => select(processGpxInput(`<gpx>${xml(text)}</gpx>`, policy));
      expect(normalize(" A\u007f\tB\nC ").name).toBe("A\u007f\tB\nC");
      expect(normalize(" ").name).toBeUndefined();
      expect(normalize("<child>value</child>").name).toBeUndefined();
      const duplicate = xml(" ").replace("</name>", "</name><name>fallback</name>");
      expect(select(processGpxInput(`<gpx>${duplicate}</gpx>`, policy)).name).toBeUndefined();
    });
    it(`${kind} never replaces the first overlong/structured/valid name with a later duplicate`, () => {
      for (const [raw, expected] of [["a".repeat(257), "a".repeat(255) + "…"], ["<child/>", undefined], ["first", "first"]]) {
        const duplicate = xml(raw!).replace("</name>", "</name><name>fallback</name>");
        expect(select(processGpxInput(`<gpx>${duplicate}</gpx>`, policy)).name).toBe(expected);
      }
    });
  }
  it.each(validTimes.map((value, index) => ({value, index})))("preserves track time $index exactly", ({value}) => {
    const d = processGpxInput(`<gpx><trk><trkseg><trkpt lat="0" lon="0"><time> ${value} </time></trkpt></trkseg></trk></gpx>`, policy);
    expect(d.data.tracks[0].segments[0].points[0].time).toBe(value);
  });
  it.each(invalidTimes.filter(value => value.trim() === value).map((value, index) => ({value, index})))("omits invalid first track time $index without fallback", ({value}) => {
    const d = processGpxInput(`<gpx><trk><trkseg><trkpt lat="0" lon="0"><time>${value}</time><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`, policy);
    expect(d.data.tracks[0].segments[0].points[0]).not.toHaveProperty("time");
  });
  it("retains B5 metadata and empty routes alongside actual geometry", () => {
    const d = processGpxInput('<gpx><rte><name>empty</name></rte><rte><desc>description</desc><rtept lat="0" lon="0"><name>point</name><desc>description</desc><sym>Flag</sym><time>2026-01-01T00:00:00Z</time></rtept></rte></gpx>', policy);
    expect(d.data.routes).toEqual([{name: "empty", points: []}, {desc: "description", points: [{coordinates: [0, 0], name: "point", desc: "description", sym: "Flag", time: "2026-01-01T00:00:00Z"}]}]);
  });
});

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("canonicalizeGpx", () => {
  it("extracts tracks, segments, points, routes, and waypoints while stripping metadata", () => {
    const result = canonicalizeGpx(parseGpxXml(fixture("sample.gpx")), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });

    expect(result).toEqual({
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
                  { coordinates: [135.1, 35.1], time: "2024-01-01T00:00:00Z" },
                ],
              },
              {
                points: [{ coordinates: [135.3, 35.3, 130] }],
              },
            ],
          },
        ],
        routes: [
          {
            name: "Sample Route",
            points: [
              { coordinates: [135, 35] },
              { coordinates: [135.05, 35.05, 42] },
            ],
          },
        ],
        waypoints: [
          { coordinates: [135.01, 35.01, 10.5], name: "Start marker" },
        ],
      },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Someone Private");
    expect(serialized).not.toContain("GPSWatch");
    expect(serialized).not.toContain("#ff0000");
    expect(serialized).not.toContain("stripped by canonicalization");
  });

  it("rejects a GPX document with no tracks, routes, or waypoints", () => {
    expect(() =>
      canonicalizeGpx(parseGpxXml(fixture("empty.gpx")), {
        maxRawBytes: 2 * 1024 * 1024,
        maxTotalPoints: Number.MAX_SAFE_INTEGER,
        maxRoutes: 20,
        maxRoutePointsPerRoute: 100,
      }),
    ).toThrow();
  });

  it("rejects malformed XML", () => {
    expect(() => {
      const malformed = fixture("malformed.gpx");
      parseGpxXml(malformed);
    }).toThrow();
  });

  it("rejects DOCTYPE-laden input before parsing", () => {
    expect(() => assertSafeGpxXml(fixture("doctype.gpx"), 2 * 1024 * 1024)).toThrow();
  });

  it("rejects ENTITY-laden input before parsing", () => {
    expect(() => assertSafeGpxXml(fixture("entity.gpx"), 2 * 1024 * 1024)).toThrow();
  });

  it("rejects the whole track when a coordinate is invalid", () => {
    expect(() => canonicalizeGpx(parseGpxXml('<gpx><trk><trkseg><trkpt lat="NaN" lon="135"/><trkpt lat="35" lon="135"/></trkseg></trk></gpx>'), {
      maxRawBytes: 2 * 1024 * 1024, maxTotalPoints: 50000, maxRoutes: 20, maxRoutePointsPerRoute: 100,
    })).toThrow();
  });

  it("preserves multiple track segments as separate segments rather than concatenating them", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk>
  <trkseg><trkpt lat="35.0" lon="135.0" /></trkseg>
  <trkseg><trkpt lat="36.0" lon="136.0" /></trkseg>
</trk></gpx>`;

    const result = canonicalizeGpx(parseGpxXml(gpx), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });

    expect(result.data.tracks[0]?.segments).toHaveLength(2);
  });

  it("removes empty segments and tracks without points", () => {
    const emptySegmentGpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk>
  <trkseg/>
  <trkseg><trkpt lat="35.0" lon="135.0" /></trkseg>
</trk></gpx>`;

    const withEmptySegment = canonicalizeGpx(parseGpxXml(emptySegmentGpx), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });
    expect(withEmptySegment.data.tracks[0]?.segments).toHaveLength(1);

    const onlyEmptySegmentsGpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk><trkseg/></trk>
  <wpt lat="35.0" lon="135.0" />
</gpx>`;

    const withDroppedTrack = canonicalizeGpx(parseGpxXml(onlyEmptySegmentsGpx), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });
    expect(withDroppedTrack.data.tracks).toHaveLength(0);
    expect(withDroppedTrack.data.waypoints).toHaveLength(1);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const input = fixture("sample.gpx");
    const results = Array.from({ length: 5 }, () => canonicalizeGpx(parseGpxXml(input), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    }));

    for (const result of results.slice(1)) {
      expect(result).toEqual(results[0]);
    }
  });

  it("rejects a GPX document when the total point budget is exceeded during traversal", () => {
    const document = parseGpxXml(`<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="35.0" lon="135.0" />
  <trkpt lat="35.1" lon="135.1" />
  <trkpt lat="35.2" lon="135.2" />
</trkseg></trk></gpx>`);

    expect(() =>
      canonicalizeGpx(document, {
        maxRawBytes: 2 * 1024 * 1024,
        maxTotalPoints: 2,
        maxRoutes: 20,
        maxRoutePointsPerRoute: 100,
      }),
    ).toThrow();
  });

  it("counts an encountered invalid point before coordinate validation", () => {
    const document = parseGpxXml(`<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="35" lon="135.0" />
  <trkpt lat="35" lon="135.0" />
  <trkpt lat="NaN" lon="135.0" />
</trkseg></trk></gpx>`);

    expect(() =>
      canonicalizeGpx(document, {
        maxRawBytes: 2 * 1024 * 1024,
        maxTotalPoints: 2,
        maxRoutes: 20,
        maxRoutePointsPerRoute: 100,
      }),
    ).toThrow("file exceeds max total points");
  });

  it("is deterministic even if wall-clock time changes between calls", () => {
    const input = fixture("sample.gpx");
    const first = canonicalizeGpx(parseGpxXml(input), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    const second = canonicalizeGpx(parseGpxXml(input), {
      maxRawBytes: 2 * 1024 * 1024,
      maxTotalPoints: Number.MAX_SAFE_INTEGER,
      maxRoutes: 20,
      maxRoutePointsPerRoute: 100,
    });
    vi.useRealTimers();

    expect(second).toEqual(first);
  });
});
