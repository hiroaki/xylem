import type { CanonicalGpxDocument } from "../../src/gpx/contract.js";

export const mixed = (): CanonicalGpxDocument => ({ schema_version: 1, data_type: "gpx", data: {
  tracks: [{ name: 'Track </title><script>window.injected=true</script> & {{ID}}', segments: [
    { points: [{ coordinates: [139.75, 35.67, 0], time: "2026-10-19T00:00:00Z" }] },
    { points: [{ coordinates: [139.751, 35.671] }, { coordinates: [139.752, 35.672] }] },
  ] }],
  routes: [{ name: "Empty route", desc: "Retained empty route", points: [] }, {
    name: "Route", desc: "Route description", points: [
      { coordinates: [139.77, 35.69, 0], name: "Start", desc: "Meeting & <safe>", sym: "Flag", time: "2026-10-19T09:00:00.123456+09:00" },
      { coordinates: [139.771, 35.691], name: "Finish" },
    ],
  }],
  waypoints: [{ coordinates: [139.76, 35.68], name: "Waypoint" }],
} });

export function richMixed(): CanonicalGpxDocument {
  const document = mixed();
  document.data.tracks.push({ name: "Second track", segments: [{ points: [
    { coordinates: [139.754, 35.674, -12.345], time: "1999-12-31T23:59:59.999-03:30" },
  ] }] });
  return document;
}
