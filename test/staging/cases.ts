import { richMixed } from "../browser/fixtures.js";
import { serializeGpx } from "../../src/gpx/serialize.js";
import { gpx, policy } from "../helpers/phase-a.js";
import type { CanonicalGpxDocument } from "../../src/gpx/contract.js";
import { readFileSync } from "node:fs";
import { expectedCanonical } from "../helpers/phase-b5.js";

type AcceptanceCase = { name: string; xml: string; expected: CanonicalGpxDocument };
const rich = richMixed();
export const cases: AcceptanceCase[] = [
  { name: "rich mixed", xml: serializeGpx(rich, policy).replace("</gpx>", '<extensions><probe xmlns="urn:phase-d">omitted</probe></extensions></gpx>'), expected: rich },
  ...["waypoint", "route", "track"].map((kind): AcceptanceCase => ({
    name: `single-point ${kind}`,
    xml: gpx(kind === "waypoint" ? '<wpt lat="35" lon="139"><ele>0</ele></wpt>'
      : kind === "route" ? '<rte><rtept lat="35" lon="139"/></rte>'
        : '<trk><trkseg><trkpt lat="35" lon="139"/></trkseg></trk>'),
    expected: { schema_version: 1, data_type: "gpx", data: {
      tracks: kind === "track" ? [{ segments: [{ points: [{ coordinates: [139, 35] }] }] }] : [],
      routes: kind === "route" ? [{ points: [{ coordinates: [139, 35] }] }] : [],
      waypoints: kind === "waypoint" ? [{ coordinates: [139, 35, 0] }] : [],
    } },
  })),
  {
    name: "accepted route boundary 20 routes x 100 points",
    xml: gpx(Array.from({ length: 20 }, (_, r) => `<rte><name>Route ${r}</name>${Array.from({ length: 100 }, (_, p) => `<rtept lat="${35 + r / 1000}" lon="${139 + p / 1000}"/>`).join("")}</rte>`).join("")),
    expected: { schema_version: 1, data_type: "gpx", data: {
      tracks: [], waypoints: [], routes: Array.from({ length: 20 }, (_, r) => ({ name: `Route ${r}`, points: Array.from({ length: 100 }, (_, p) => ({ coordinates: [139 + p / 1000, 35 + r / 1000] as [number, number] })) })),
    } },
  },
  {
    name: "wide-area B5",
    xml: readFileSync(new URL("../fixtures/b5-wide-area.gpx", import.meta.url), "utf8"),
    expected: expectedCanonical,
  },
];
