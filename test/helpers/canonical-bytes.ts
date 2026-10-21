import type { CanonicalGpxDocument } from "../../src/gpx/contract.js";

// A legal timestamp fraction has no independent length cap. One point keeps
// count/text budgets valid without enabling new metadata ingestion.
export function canonicalBytes(size: number): CanonicalGpxDocument {
  const d: CanonicalGpxDocument = {schema_version: 1, data_type: "gpx", data: {
    tracks: [{segments: [{points: [{coordinates: [0.000001, 0], time: "2026-10-19T00:00:00.1Z"}]}]}],
    routes: [], waypoints: [],
  }};
  const extra = size - Buffer.byteLength(JSON.stringify(d));
  if (extra < 0) throw new Error("fixture size too small");
  d.data.tracks[0].segments[0].points[0].time = "2026-10-19T00:00:00." + "1".repeat(extra + 1) + "Z";
  return d;
}
