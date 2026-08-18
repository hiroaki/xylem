import { parseGpxXml } from "./parse.js";
import type {
  GpxDocumentNode,
  GpxPointNode,
  GpxRouteNode,
  GpxTrackNode,
} from "./parse.js";
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

function normalizeName(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const cleaned = raw
    .replace(CONTROL_CHARACTERS_PATTERN, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

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

function canonicalizeTrack(node: GpxTrackNode): CanonicalTrack | null {
  const segments: CanonicalSegment[] = [];

  for (const segmentNode of (node.trkseg ?? []).slice(0, MAX_SEGMENTS_PER_TRACK)) {
    const points: CanonicalPoint[] = [];

    for (const pointNode of (segmentNode.trkpt ?? []).slice(0, MAX_POINTS_PER_SEGMENT)) {
      const coordinates = toCoordinates(pointNode);
      if (!coordinates) {
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

  const name = normalizeName(node.name);
  return name ? { name, segments } : { segments };
}

function canonicalizeRoute(node: GpxRouteNode): CanonicalRoute | null {
  const points: CanonicalRoutePoint[] = [];

  for (const pointNode of (node.rtept ?? []).slice(0, MAX_POINTS_PER_ROUTE)) {
    const coordinates = toCoordinates(pointNode);
    if (coordinates) {
      points.push({ coordinates });
    }
  }

  if (points.length === 0) {
    return null;
  }

  const name = normalizeName(node.name);
  return name ? { name, points } : { points };
}

function canonicalizeWaypoint(node: GpxPointNode): CanonicalWaypoint | null {
  const coordinates = toCoordinates(node);
  if (!coordinates) {
    return null;
  }

  const name = normalizeName(node.name);
  return name ? { coordinates, name } : { coordinates };
}

// Single source of truth: /api/normalize and /api/upload must both call this
// function (never a route-local variant) so preview and stored data always match.
// Pure and deterministic: no wall-clock/random values, source-document order preserved.
export function canonicalizeGpx(rawText: string): CanonicalGpxDocument {
  const document: GpxDocumentNode = parseGpxXml(rawText);

  const tracks = (document.trk ?? [])
    .slice(0, MAX_TRACKS)
    .map(canonicalizeTrack)
    .filter((track): track is CanonicalTrack => track !== null);

  const routes = (document.rte ?? [])
    .slice(0, MAX_ROUTES)
    .map(canonicalizeRoute)
    .filter((route): route is CanonicalRoute => route !== null);

  const waypoints = (document.wpt ?? [])
    .slice(0, MAX_WAYPOINTS)
    .map(canonicalizeWaypoint)
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
