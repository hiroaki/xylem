import type { GpxPolicy } from "../policy.js";
import {
  type CanonicalGpxDocument, type GpxTextField,
  MIN_LONGITUDE, MAX_LONGITUDE, MIN_LATITUDE, MAX_LATITUDE, MIN_ELEVATION, MAX_ELEVATION,
} from "./contract.js";
import { CanonicalValidationError } from "./errors.js";
import { isValidCanonicalText } from "./text.js";
import { isValidGpxTime } from "./time.js";

function fail(reason: CanonicalValidationError["reason"] = "structure"): never {
  throw new CanonicalValidationError(reason);
}

// Accept JSON records only, with own data properties. Reject unknown branches
// and accessors before any consumer can evaluate their contents.
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) fail();
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable) fail();
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail();
  return value as Record<string, unknown>;
}

function array(value: unknown, nonempty = false): unknown[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail();
  return value;
}

function coordinates(value: unknown): void {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) fail("coordinates");
  const [lon, lat, ele] = value;
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < MIN_LONGITUDE || lon >= MAX_LONGITUDE
    || typeof lat !== "number" || !Number.isFinite(lat) || lat < MIN_LATITUDE || lat > MAX_LATITUDE) fail("coordinates");
  if (value.length === 3 && (typeof ele !== "number" || !Number.isFinite(ele) || ele < MIN_ELEVATION || ele > MAX_ELEVATION)) fail("coordinates");
}

function text(value: Record<string, unknown>, field: GpxTextField): void {
  if (Object.hasOwn(value, field) && !isValidCanonicalText(value[field], field)) fail("text");
}

function time(value: Record<string, unknown>): void {
  if (Object.hasOwn(value, "time") && !isValidGpxTime(value.time)) fail("time");
}

// Strict acceptance of canonical data: no GPX ingestion repair or mutation.
export function assertValidCanonicalGpxDocument(value: unknown, policy: GpxPolicy): asserts value is CanonicalGpxDocument {
  const envelope = object(value, ["schema_version", "data_type", "data"]);
  if (envelope.schema_version !== 1 || envelope.data_type !== "gpx") fail();
  const data = object(envelope.data, ["tracks", "routes", "waypoints"]);
  const tracks = array(data.tracks), routes = array(data.routes), waypoints = array(data.waypoints);
  if (routes.length > policy.maxRoutes) fail("resource");
  let totalPoints = 0;
  function count(points: unknown[]): void {
    totalPoints += points.length;
    if (totalPoints > policy.maxTotalPoints) fail("resource");
  }
  for (const value of tracks) {
    const track = object(value, ["segments"], ["name"]);
    text(track, "name");
    for (const value of array(track.segments, true)) {
      const segment = object(value, ["points"]);
      const points = array(segment.points, true);
      count(points);
      for (const value of points) {
        const point = object(value, ["coordinates"], ["time"]);
        coordinates(point.coordinates);
        time(point);
      }
    }
  }
  for (const value of routes) {
    const route = object(value, ["points"], ["name", "desc"]);
    text(route, "name"); text(route, "desc");
    const points = array(route.points);
    if (points.length > policy.maxRoutePointsPerRoute) fail("resource");
    count(points);
    for (const value of points) {
      const point = object(value, ["coordinates"], ["name", "desc", "sym", "time"]);
      coordinates(point.coordinates);
      text(point, "name"); text(point, "desc"); text(point, "sym"); time(point);
    }
  }
  count(waypoints);
  for (const value of waypoints) {
    const point = object(value, ["coordinates"], ["name"]);
    coordinates(point.coordinates);
    text(point, "name");
  }
  if (totalPoints === 0) fail("geometry");
}
