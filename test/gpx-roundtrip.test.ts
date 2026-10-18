import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { policy } from "./helpers/phase-a.js";
import { serializeGpx } from "../src/gpx/serialize.js";

function fixture(name: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "fixtures", name),
    "utf8",
  );
}

describe("canonicalize/serialize idempotency", () => {
  const cases: Array<{ name: string; gpx: string }> = [
    {name: "tiny positive/negative coordinates", gpx: '<gpx><wpt lat="0.0000001" lon="-0.0000001"/></gpx>'},
    {name: "minimum subnormal coordinate", gpx: '<gpx><wpt lat="0.' + '0'.repeat(323) + '5" lon="0"/></gpx>'},
    {name: "CR and CRLF references in name", gpx: '<gpx><wpt lat="0" lon="0"><name>A&#13;B&#13;&#10;C</name></wpt></gpx>'},
    {name: "truncated Unicode name and exact offset/fraction time", gpx: '<gpx><trk><name>' + '😀'.repeat(255) + '…</name><trkseg><trkpt lat="90" lon="-180"><ele>0</ele><time>0001-01-01T00:00:00.000123456+14:00</time></trkpt></trkseg></trk></gpx>'},
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
      const parsed = parseGpxXml(gpx);
      const canonical = canonicalizeGpx(parsed, {
        maxRawBytes: 2 * 1024 * 1024,
        maxTotalPoints: Number.MAX_SAFE_INTEGER,
        maxRoutes: 20,
        maxRoutePointsPerRoute: 100,
      });
      const roundTripped = canonicalizeGpx(parseGpxXml(serializeGpx(canonical, policy)), {
        maxRawBytes: 2 * 1024 * 1024,
        maxTotalPoints: Number.MAX_SAFE_INTEGER,
        maxRoutes: 20,
        maxRoutePointsPerRoute: 100,
      });

      expect(roundTripped).toEqual(canonical);
    },
  );
});
