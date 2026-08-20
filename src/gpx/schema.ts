import { GpxNormalizationError } from "./errors.js";
import {
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MAX_NAME_LENGTH,
  MAX_POINTS_PER_ROUTE,
  MAX_POINTS_PER_SEGMENT,
  MAX_ROUTES,
  MAX_SEGMENTS_PER_TRACK,
  MAX_TRACKS,
  MAX_WAYPOINTS,
  MIN_LATITUDE,
  MIN_LONGITUDE,
} from "./limits.js";
import type { CanonicalCoordinates, CanonicalGpxDocument } from "./canonicalize.js";

function fail(reason: string): never {
  throw new GpxNormalizationError(`invalid canonical GPX document: ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCoordinates(value: unknown, path: string): asserts value is CanonicalCoordinates {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    fail(`${path} must be a [lon, lat] or [lon, lat, ele] array`);
  }

  const [lon, lat, elevation] = value;

  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < MIN_LONGITUDE || lon > MAX_LONGITUDE) {
    fail(`${path}[0] must be a finite longitude within [${MIN_LONGITUDE}, ${MAX_LONGITUDE}]`);
  }

  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < MIN_LATITUDE || lat > MAX_LATITUDE) {
    fail(`${path}[1] must be a finite latitude within [${MIN_LATITUDE}, ${MAX_LATITUDE}]`);
  }

  if (value.length === 3 && (typeof elevation !== "number" || !Number.isFinite(elevation))) {
    fail(`${path}[2] must be a finite elevation when present`);
  }
}

function assertOptionalName(value: unknown, path: string): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || value.length === 0 || value.length > MAX_NAME_LENGTH) {
    fail(`${path} must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`);
  }
}

function assertOptionalTime(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${path} must be an ISO 8601 timestamp string when present`);
  }
}

// Structural/defensive validation only — mirrors the invariants Anemochore enforces
// independently on the same canonical payload; this is not GPX semantic validation.
export function assertValidCanonicalGpxDocument(
  value: unknown,
): asserts value is CanonicalGpxDocument {
  if (!isPlainObject(value)) {
    fail("document must be an object");
  }

  if (value.schema_version !== 1) {
    fail("schema_version must be 1");
  }

  if (value.data_type !== "gpx") {
    fail('data_type must be "gpx"');
  }

  if (!isPlainObject(value.data)) {
    fail("data must be an object");
  }

  const { tracks, routes, waypoints } = value.data;

  if (!Array.isArray(tracks) || tracks.length > MAX_TRACKS) {
    fail(`data.tracks must be an array of at most ${MAX_TRACKS} tracks`);
  }

  tracks.forEach((track, trackIndex) => {
    if (!isPlainObject(track)) {
      fail(`data.tracks[${trackIndex}] must be an object`);
    }

    assertOptionalName(track.name, `data.tracks[${trackIndex}].name`);

    if (!Array.isArray(track.segments) || track.segments.length === 0 || track.segments.length > MAX_SEGMENTS_PER_TRACK) {
      fail(`data.tracks[${trackIndex}].segments must be a non-empty array of at most ${MAX_SEGMENTS_PER_TRACK} segments`);
    }

    track.segments.forEach((segment: unknown, segmentIndex: number) => {
      if (!isPlainObject(segment)) {
        fail(`data.tracks[${trackIndex}].segments[${segmentIndex}] must be an object`);
      }

      if (!Array.isArray(segment.points) || segment.points.length === 0 || segment.points.length > MAX_POINTS_PER_SEGMENT) {
        fail(`data.tracks[${trackIndex}].segments[${segmentIndex}].points must be a non-empty array of at most ${MAX_POINTS_PER_SEGMENT} points`);
      }

      segment.points.forEach((point: unknown, pointIndex: number) => {
        const path = `data.tracks[${trackIndex}].segments[${segmentIndex}].points[${pointIndex}]`;
        if (!isPlainObject(point)) {
          fail(`${path} must be an object`);
        }

        assertCoordinates(point.coordinates, `${path}.coordinates`);
        assertOptionalTime(point.time, `${path}.time`);
      });
    });
  });

  if (!Array.isArray(routes) || routes.length > MAX_ROUTES) {
    fail(`data.routes must be an array of at most ${MAX_ROUTES} routes`);
  }

  routes.forEach((route, routeIndex) => {
    if (!isPlainObject(route)) {
      fail(`data.routes[${routeIndex}] must be an object`);
    }

    assertOptionalName(route.name, `data.routes[${routeIndex}].name`);

    if (!Array.isArray(route.points) || route.points.length === 0 || route.points.length > MAX_POINTS_PER_ROUTE) {
      fail(`data.routes[${routeIndex}].points must be a non-empty array of at most ${MAX_POINTS_PER_ROUTE} points`);
    }

    route.points.forEach((point: unknown, pointIndex: number) => {
      const path = `data.routes[${routeIndex}].points[${pointIndex}]`;
      if (!isPlainObject(point)) {
        fail(`${path} must be an object`);
      }

      assertCoordinates(point.coordinates, `${path}.coordinates`);
    });
  });

  if (!Array.isArray(waypoints) || waypoints.length > MAX_WAYPOINTS) {
    fail(`data.waypoints must be an array of at most ${MAX_WAYPOINTS} waypoints`);
  }

  waypoints.forEach((waypoint, waypointIndex) => {
    const path = `data.waypoints[${waypointIndex}]`;
    if (!isPlainObject(waypoint)) {
      fail(`${path} must be an object`);
    }

    assertCoordinates(waypoint.coordinates, `${path}.coordinates`);
    assertOptionalName(waypoint.name, `${path}.name`);
  });

  if (tracks.length === 0 && routes.length === 0 && waypoints.length === 0) {
    fail("data must contain at least one track, route, or waypoint");
  }
}
