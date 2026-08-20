import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { serializeGpx } from "../src/gpx/serialize.js";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("canonicalize/serialize idempotency", () => {
  const cases: Array<{ name: string; gpx: string }> = [
    { name: "multi-track/route/waypoint fixture", gpx: fixture("sample.gpx") },
    {
      name: "multi-segment track only",
      gpx: `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="35.0" lon="135.0" /></trkseg><trkseg><trkpt lat="36.0" lon="136.0"><ele>10</ele></trkpt></trkseg></trk></gpx>`,
    },
    {
      name: "routes only",
      gpx: `<?xml version="1.0"?><gpx version="1.1"><rte><name>R</name><rtept lat="1" lon="2" /><rtept lat="3" lon="4"><ele>5</ele></rtept></rte></gpx>`,
    },
    {
      name: "waypoints only",
      gpx: `<?xml version="1.0"?><gpx version="1.1"><wpt lat="10" lon="20"><name>A</name></wpt><wpt lat="11" lon="21"><ele>1.5</ele></wpt></gpx>`,
    },
    {
      name: "mixed elevation/time presence",
      gpx: `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="1" lon="1"><ele>1</ele><time>2024-01-01T00:00:00Z</time></trkpt><trkpt lat="2" lon="2" /></trkseg></trk></gpx>`,
    },
  ];

  it.each(cases)(
    "canonicalize(serialize(canonicalize(input))) equals canonicalize(input) — $name",
    ({ gpx }) => {
      const canonical = canonicalizeGpx(gpx);
      const roundTripped = canonicalizeGpx(serializeGpx(canonical));

      expect(roundTripped).toEqual(canonical);
    },
  );
});
