import type {
  GpxDocumentNode,
  GpxPointNode,
  GpxRouteNode,
  GpxTrackNode,
} from "./parse.js";
import { GpxNormalizationError } from "./errors.js";
import type { GpxPolicy } from "../policy.js";
import {
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
} from "./schema.js";

export type CanonicalCoordinates =
  | [number, number]
  | [number, number, number];

export type CanonicalPoint = {
  coordinates: CanonicalCoordinates;
  time?: string;
};

export type CanonicalSegment = {
  points: CanonicalPoint[];
};

export type CanonicalTrack = {
  name?: string;
  segments: CanonicalSegment[];
};

export type CanonicalRoutePoint = {
  coordinates: CanonicalCoordinates;
};

export type CanonicalRoute = {
  name?: string;
  points: CanonicalRoutePoint[];
};

export type CanonicalWaypoint = {
  coordinates: CanonicalCoordinates;
  name?: string;
};

export type CanonicalGpxData = {
  tracks: CanonicalTrack[];
  routes: CanonicalRoute[];
  waypoints: CanonicalWaypoint[];
};

export type CanonicalGpxDocument = {
  schema_version: 1;
  data_type: "gpx";
  data: CanonicalGpxData;
};

const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function normalizeName(raw: string | undefined, policy: GpxPolicy): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  // Names are intentionally truncated during normalization to enforce the
  // canonical representation length policy.
  const cleaned = raw
    .replace(CONTROL_CHARACTERS_PATTERN, "")
    .trim()
    .slice(0, policy.maxNameLength);

  return cleaned.length > 0 ? cleaned : undefined;
}

function toCoordinates(node: GpxPointNode | undefined): CanonicalCoordinates | null {
  if (!node) {
    return null;
  }

  const lon = Number(node.lon);
  const lat = Number(node.lat);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  if (lon < MIN_LONGITUDE || lon > MAX_LONGITUDE) {
    return null;
  }

  if (lat < MIN_LATITUDE || lat > MAX_LATITUDE) {
    return null;
  }

  const elevation = node.ele !== undefined ? Number(node.ele) : Number.NaN;

  return Number.isFinite(elevation) ? [lon, lat, elevation] : [lon, lat];
}

function toTime(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : undefined;
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
      // Invalid points still count because the budget protects against
      // expensive input traversal, not only canonical output size.
      totalPointBudget.count += 1;

      if (totalPointBudget.count > policy.maxTotalPoints) {
        throw new GpxNormalizationError("file exceeds max total points");
      }

      const coordinates = toCoordinates(pointNode);
      if (!coordinates) {
        // Invalid coordinate points are intentionally dropped during normalization
        // so a single malformed point does not invalidate the rest of a track.
        continue;
      }

      const time = toTime(pointNode.time);
      points.push(time ? { coordinates, time } : { coordinates });
    }

    if (points.length > 0) {
      segments.push({ points });
    }
  }

  if (segments.length === 0) {
    return null;
  }

  const name = normalizeName(node.name, policy);
  return name ? { name, segments } : { segments };
}

function canonicalizeRoute(node: GpxRouteNode, policy: GpxPolicy, totalPointBudget: { count: number }): CanonicalRoute | null {
  const points: CanonicalRoutePoint[] = [];

  for (const pointNode of node.rtept ?? []) {
    totalPointBudget.count += 1;

    if (totalPointBudget.count > policy.maxTotalPoints) {
      throw new GpxNormalizationError("file exceeds max total points");
    }

    const coordinates = toCoordinates(pointNode);
    if (coordinates) {
      points.push({ coordinates });
    }
  }

  if (points.length === 0) {
    return null;
  }

  const name = normalizeName(node.name, policy);
  return name ? { name, points } : { points };
}

function canonicalizeWaypoint(node: GpxPointNode, policy: GpxPolicy, totalPointBudget: { count: number }): CanonicalWaypoint | null {
  totalPointBudget.count += 1;

  if (totalPointBudget.count > policy.maxTotalPoints) {
    throw new GpxNormalizationError("file exceeds max total points");
  }

  const coordinates = toCoordinates(node);
  if (!coordinates) {
    return null;
  }

  const name = normalizeName(node.name, policy);
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

  const tracks = (document.trk ?? [])
    .map((track) => canonicalizeTrack(track, policy, totalPointBudget))
    .filter((track): track is CanonicalTrack => track !== null);

  const routes = (document.rte ?? [])
    .map((route) => canonicalizeRoute(route, policy, totalPointBudget))
    .filter((route): route is CanonicalRoute => route !== null);

  const waypoints = (document.wpt ?? [])
    .map((waypoint) => canonicalizeWaypoint(waypoint, policy, totalPointBudget))
    .filter((waypoint): waypoint is CanonicalWaypoint => waypoint !== null);

  if (tracks.length === 0 && routes.length === 0 && waypoints.length === 0) {
    throw new GpxNormalizationError("invalid GPX file");
  }

  return {
    schema_version: 1,
    data_type: "gpx",
    data: { tracks, routes, waypoints },
  };
}
