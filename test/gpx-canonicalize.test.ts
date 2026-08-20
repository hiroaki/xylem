import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("canonicalizeGpx", () => {
  it("extracts tracks, segments, points, routes, and waypoints while stripping metadata", () => {
    const result = canonicalizeGpx(fixture("sample.gpx"));

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
    expect(() => canonicalizeGpx(fixture("empty.gpx"))).toThrow();
  });

  it("rejects malformed XML", () => {
    expect(() => canonicalizeGpx(fixture("malformed.gpx"))).toThrow();
  });

  it("rejects DOCTYPE-laden input before parsing", () => {
    expect(() => canonicalizeGpx(fixture("doctype.gpx"))).toThrow();
  });

  it("rejects ENTITY-laden input before parsing", () => {
    expect(() => canonicalizeGpx(fixture("entity.gpx"))).toThrow();
  });

  it("drops points with non-finite or out-of-range coordinates instead of failing the whole track", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk><trkseg>
  <trkpt lat="NaN" lon="135.5"><ele>999</ele></trkpt>
  <trkpt lat="35.0" lon="200.0" />
  <trkpt lat="35.1" lon="135.1" />
</trkseg></trk></gpx>`;

    const result = canonicalizeGpx(gpx);

    expect(result.data.tracks).toHaveLength(1);
    expect(result.data.tracks[0]?.segments[0]?.points).toEqual([
      { coordinates: [135.1, 35.1] },
    ]);
  });

  it("preserves multiple track segments as separate segments rather than concatenating them", () => {
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk>
  <trkseg><trkpt lat="35.0" lon="135.0" /></trkseg>
  <trkseg><trkpt lat="36.0" lon="136.0" /></trkseg>
</trk></gpx>`;

    const result = canonicalizeGpx(gpx);

    expect(result.data.tracks[0]?.segments).toHaveLength(2);
  });

  it("drops a segment with no valid points, and a track with no valid segments", () => {
    const emptySegmentGpx = `<?xml version="1.0"?>
<gpx version="1.1"><trk>
  <trkseg><trkpt lat="NaN" lon="135.0" /></trkseg>
  <trkseg><trkpt lat="35.0" lon="135.0" /></trkseg>
</trk></gpx>`;

    const withEmptySegment = canonicalizeGpx(emptySegmentGpx);
    expect(withEmptySegment.data.tracks[0]?.segments).toHaveLength(1);

    const onlyEmptySegmentsGpx = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk><trkseg><trkpt lat="NaN" lon="135.0" /></trkseg></trk>
  <wpt lat="35.0" lon="135.0" />
</gpx>`;

    const withDroppedTrack = canonicalizeGpx(onlyEmptySegmentsGpx);
    expect(withDroppedTrack.data.tracks).toHaveLength(0);
    expect(withDroppedTrack.data.waypoints).toHaveLength(1);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const input = fixture("sample.gpx");
    const results = Array.from({ length: 5 }, () => canonicalizeGpx(input));

    for (const result of results.slice(1)) {
      expect(result).toEqual(results[0]);
    }
  });

  it("is deterministic even if wall-clock time changes between calls", () => {
    const input = fixture("sample.gpx");
    const first = canonicalizeGpx(input);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    const second = canonicalizeGpx(input);
    vi.useRealTimers();

    expect(second).toEqual(first);
  });
});
