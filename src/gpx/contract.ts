// Canonical GPX v1: domain invariants and types, independent of input/configuration.
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;
export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_ELEVATION = -99999;
export const MAX_ELEVATION = 99999;
export const TEXT_LIMITS = { name: 256, desc: 4096, sym: 128 } as const;
export type GpxTextField = keyof typeof TEXT_LIMITS;

export type CanonicalCoordinates = [number, number] | [number, number, number];
export type CanonicalPoint = { coordinates: CanonicalCoordinates; time?: string };
export type CanonicalSegment = { points: CanonicalPoint[] };
export type CanonicalTrack = { name?: string; segments: CanonicalSegment[] };
export type CanonicalRoutePoint = {
  coordinates: CanonicalCoordinates;
  name?: string;
  desc?: string;
  sym?: string;
  time?: string;
};
export type CanonicalRoute = { name?: string; desc?: string; points: CanonicalRoutePoint[] };
export type CanonicalWaypoint = { coordinates: CanonicalCoordinates; name?: string };
export type CanonicalGpxData = {
  tracks: CanonicalTrack[];
  routes: CanonicalRoute[];
  waypoints: CanonicalWaypoint[];
};
export type CanonicalGpxDocument = { schema_version: 1; data_type: "gpx"; data: CanonicalGpxData };
