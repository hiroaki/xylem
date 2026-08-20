import { describe, expect, it } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { assertValidCanonicalGpxDocument } from "../src/gpx/schema.js";

describe("assertValidCanonicalGpxDocument", () => {
  it("accepts a canonicalize() result unchanged", () => {
    const doc = canonicalizeGpx(
      `<?xml version="1.0"?><gpx version="1.1"><wpt lat="1" lon="2" /></gpx>`,
    );

    expect(() => assertValidCanonicalGpxDocument(doc)).not.toThrow();
  });

  it("rejects a wrong data_type", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "geojson",
        data: { tracks: [], routes: [], waypoints: [{ coordinates: [1, 2] }] },
      }),
    ).toThrow();
  });

  it("rejects an empty document (no tracks/routes/waypoints)", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [], routes: [], waypoints: [] },
      }),
    ).toThrow();
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [], routes: [], waypoints: [{ coordinates: [200, 2] }] },
      }),
    ).toThrow();
  });

  it("rejects a track with an empty segments array", () => {
    expect(() =>
      assertValidCanonicalGpxDocument({
        schema_version: 1,
        data_type: "gpx",
        data: { tracks: [{ segments: [] }], routes: [], waypoints: [] },
      }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => assertValidCanonicalGpxDocument({})).toThrow();
    expect(() => assertValidCanonicalGpxDocument(null)).toThrow();
    expect(() => assertValidCanonicalGpxDocument("not an object")).toThrow();
  });
});
