import type {
  GpxDocumentNode,
  GpxPointNode,
  GpxRouteNode,
  GpxTrackNode,
} from "./parse.js";
import { GpxNormalizationError } from "./errors.js";
import type { GpxPolicy } from "../policy.js";
import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
} from "./contract.js";

import type {
  CanonicalCoordinates, CanonicalPoint, CanonicalSegment, CanonicalTrack,
  CanonicalRoutePoint, CanonicalRoute, CanonicalWaypoint, CanonicalGpxDocument,
} from "./contract.js";
// Retain type-only imports for existing consumers; definitions live in contract.ts.
export type * from "./contract.js";
import { normalizeGpxText } from "./text.js";
import { normalizeGpxTime } from "./time.js";

// XML whitespace only; JavaScript trim would also accept non-XML spaces.
const trimXmlWhitespace = (value: string) => value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
const DECIMAL = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
function coordinate(raw: string | undefined, minimum: number, maximum: number, exclusive = false): number {
  if (typeof raw !== "string" || !DECIMAL.test(trimXmlWhitespace(raw))) {
    throw new GpxNormalizationError("invalid GPX coordinates");
  }
  const value = Number(trimXmlWhitespace(raw));
  if (!Number.isFinite(value) || value < minimum || (exclusive ? value >= maximum : value > maximum)) {
    throw new GpxNormalizationError("invalid GPX coordinates");
  }
  return value;
}
function toCoordinates(node: GpxPointNode): CanonicalCoordinates {
  const lon = coordinate(node.lon, MIN_LONGITUDE, MAX_LONGITUDE, true);
  const lat = coordinate(node.lat, MIN_LATITUDE, MAX_LATITUDE);
  const rawElevation = node.ele === undefined ? "" : trimXmlWhitespace(node.ele);
  // Inspect original digits (including leading/trailing zeros) before conversion.
  const elevationDigits = /^[+-]?(?:([0-9]{1,5})(?:\.([0-9]{0,3}))?|\.([0-9]{1,3}))$/;
  const elevation = elevationDigits.test(rawElevation) ? Number(rawElevation) : Number.NaN;
  return Number.isFinite(elevation) && elevation >= MIN_ELEVATION && elevation <= MAX_ELEVATION
    ? [lon, lat, elevation] : [lon, lat];
}

function canonicalizeTrack(node: GpxTrackNode, policy: GpxPolicy, totalPointBudget: { count: number }): CanonicalTrack | null {
  const segments: CanonicalSegment[] = [];

  for (const segmentNode of node.trkseg ?? []) {
    const points: CanonicalPoint[] = [];

    for (const pointNode of segmentNode.trkpt ?? []) {
      // maxTotalPoints is an operational traversal budget, not a GPX schema rule.
      // It counts raw GPX points encountered during traversal before coordinate
      // validation, so invalid points still consume the budget and malformed input
      // cannot bypass resource limits by being discarded after parsing.
      // Consume the traversal budget before validation.
      totalPointBudget.count += 1;

      if (totalPointBudget.count > policy.maxTotalPoints) {
        throw new GpxNormalizationError("file exceeds max total points");
      }

      const coordinates = toCoordinates(pointNode);

      const time = normalizeGpxTime(pointNode.time);
      points.push(time ? { coordinates, time } : { coordinates });
    }

    if (points.length > 0) {
      segments.push({ points });
    }
  }

  if (segments.length === 0) {
    return null;
  }

  const name = normalizeGpxText(node.name, "name");
  return name ? { name, segments } : { segments };
}

function canonicalizeRoute(node: GpxRouteNode, policy: GpxPolicy, totalPointBudget: { count: number }): CanonicalRoute {
  const points: CanonicalRoutePoint[] = [];
  if ((node.rtept?.length ?? 0) > policy.maxRoutePointsPerRoute) {
    throw new GpxNormalizationError("file exceeds max route points");
  }

  for (const pointNode of node.rtept ?? []) {
    totalPointBudget.count += 1;

    if (totalPointBudget.count > policy.maxTotalPoints) {
      throw new GpxNormalizationError("file exceeds max total points");
    }

    const coordinates = toCoordinates(pointNode);
    const point: CanonicalRoutePoint = { coordinates };
    const time = normalizeGpxTime(pointNode.time);
    if (time !== undefined) point.time = time;
    for (const field of ["name", "desc", "sym"] as const) {
      const text = normalizeGpxText(pointNode[field], field);
      if (text !== undefined) point[field] = text;
    }
    points.push(point);
  }

  const route: CanonicalRoute = { points };
  for (const field of ["name", "desc"] as const) {
    const text = normalizeGpxText(node[field], field);
    if (text !== undefined) route[field] = text;
  }
  return route;
}

function canonicalizeWaypoint(node: GpxPointNode, policy: GpxPolicy, totalPointBudget: { count: number }): CanonicalWaypoint {
  totalPointBudget.count += 1;

  if (totalPointBudget.count > policy.maxTotalPoints) {
    throw new GpxNormalizationError("file exceeds max total points");
  }

  const coordinates = toCoordinates(node);

  const name = normalizeGpxText(node.name, "name");
  return name ? { coordinates, name } : { coordinates };
}

// Single source of truth: /api/normalize and /api/upload must both call this
// function (never a route-local variant) so preview and stored data always match.
// The function receives a parsed document and explicit policy values so it can
// enforce operational budgets during canonicalization without accessing config.
export function canonicalizeGpx(
  document: GpxDocumentNode,
  policy: GpxPolicy,
): CanonicalGpxDocument {
  const totalPointBudget = { count: 0 };
  if ((document.rte?.length ?? 0) > policy.maxRoutes) {
    throw new GpxNormalizationError("file exceeds max routes");
  }

  const tracks = (document.trk ?? [])
    .map((track) => canonicalizeTrack(track, policy, totalPointBudget))
    .filter((track): track is CanonicalTrack => track !== null);

  const routes = (document.rte ?? [])
    .map((route) => canonicalizeRoute(route, policy, totalPointBudget));

  const waypoints = (document.wpt ?? [])
    .map((waypoint) => canonicalizeWaypoint(waypoint, policy, totalPointBudget));

  // Empty routes are retained containers, not geographic points.
  if (totalPointBudget.count === 0) {
    throw new GpxNormalizationError("invalid GPX file");
  }

  return {
    schema_version: 1,
    data_type: "gpx",
    data: { tracks, routes, waypoints },
  };
}
