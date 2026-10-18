import type { GpxPolicy } from "../../src/policy.js";

export const policy = {
  maxRawBytes: 2 * 1024 * 1024,
  maxTotalPoints: 50_000,
  maxNameLength: 200,
  maxRoutes: 20,
  maxRoutePointsPerRoute: 100,
} satisfies GpxPolicy;

export const namespace = "http://www.topografix.com/GPX/1/1";
export const gpx = (body: string) => `<gpx xmlns="${namespace}" version="1.1">${body}</gpx>`;
export const pointKinds = ["wpt", "rtept", "trkpt"] as const;
export function geometry(kind: typeof pointKinds[number], attributes = 'lat="0" lon="0"', content = ""): string {
  const point = `<${kind} ${attributes}>${content}</${kind}>`;
  return kind === "rtept" ? `<rte>${point}</rte>` : kind === "trkpt" ? `<trk><trkseg>${point}</trkseg></trk>` : point;
}

export const invalidCoordinates = [
  'lon="1"', 'lat="1"', 'lat="" lon="1"', 'lat=" \t " lon="1"',
  'lat="1" lon=""', 'lat="NaN" lon="1"', 'lat="1" lon="Infinity"',
  'lat="0x10" lon="1"', 'lat="0b10" lon="1"', 'lat="0o10" lon="1"',
  'lat="1e-7" lon="1"', 'lat="1" lon="1E1"', 'lat="1,2" lon="1"',
  'lat="1junk" lon="1"', 'lat="90.0001" lon="1"', 'lat="-90.0001" lon="1"',
  'lat="0" lon="179.99999999999999999999"', // Rounds to excluded canonical +180.
  'lat="0" lon="180"', 'lat="0" lon="180.1"', 'lat="0" lon="-180.1"',
  'lat="\u00a00\u00a0" lon="1"',
];
export const validCoordinates = [
  ['lat="0" lon="0"', [0, 0]], ['lat="-0" lon="+0"', [0, -0]],
  ['lat="90" lon="-180"', [-180, 90]], ['lat="-90" lon="179.999"', [179.999, -90]],
  ['lat=" .5 " lon=" 1. "', [1, .5]], ['lat="0.0000001" lon="-0.0000001"', [-.0000001, .0000001]],
  ['lat="0" lon="179.99999999999997"', [179.99999999999997, 0]],
  [`lat="0.${'0'.repeat(400)}1" lon="0"`, [0, 0]], // No exact-decimal/underflow guarantee.
] as const;
export const validElevation = ["99999", "-99999", "99999.000", "+99999.000", "1234.567", "0", "+0", "-0", "0.000", " .5 ", "1."];
export const invalidElevation = ["", " \t ", "-99999.999", "99999.001", "100000", "-100000", "1234.5678", "0.0001", "000001", "1e3", "0x10", "0b10", "0o10", "NaN", "Infinity", "1,2", "junk"];
