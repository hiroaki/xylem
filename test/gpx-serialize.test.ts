import { describe, expect, it } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
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

    const xml = serializeGpx(document);

    expect(xml).toContain('<trkpt lat="35.2" lon="135.2">');
    expect(xml).toContain("<ele>120.5</ele>");
    expect(xml).toContain("<time>2024-01-01T00:10:00Z</time>");
    expect(xml).toContain('<trkpt lat="35.1" lon="135.1">');
    expect(xml).toContain('<wpt lat="35.01" lon="135.01">');
    expect(xml).toContain("<name>Start marker</name>");

    const reCanonicalized = canonicalizeGpx(xml);
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

    const xml = serializeGpx(document);

    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain("]]></wpt>");
    expect(xml).toContain("Tom &amp; Jerry &lt;script&gt;");

    const reCanonicalized = canonicalizeGpx(xml);
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

    const xml = serializeGpx(document);

    expect(xml).not.toContain("<author");
    expect(xml).not.toContain("<extensions");
    expect(xml).not.toContain("<desc");
    expect(xml).not.toContain("<creator");
  });
});
