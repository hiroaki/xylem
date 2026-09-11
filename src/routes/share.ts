import { Hono } from "hono";
import type { Context } from "hono";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfig } from "../config.js";
import { createAnemochoreClient } from "../services/anemochore.js";

const router = new Hono();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = process.env.SHARE_CACHE_DIR ?? "/tmp/gpx-share";

const inFlight = new Map<string, Promise<string | null>>();

function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

type CanonicalCoordinates =
  | [number, number]
  | [number, number, number];

type CanonicalPoint = {
  coordinates: CanonicalCoordinates;
  time?: string;
};

type CanonicalSegment = {
  points: CanonicalPoint[];
};

type CanonicalTrack = {
  name?: string;
  segments: CanonicalSegment[];
};

type CanonicalRoutePoint = {
  coordinates: CanonicalCoordinates;
};

type CanonicalRoute = {
  name?: string;
  points: CanonicalRoutePoint[];
};

type CanonicalWaypoint = {
  coordinates: CanonicalCoordinates;
  name?: string;
};

type CanonicalGpxDocument = {
  schema_version: 1;
  data_type: "gpx";
  data: {
    tracks: CanonicalTrack[];
    routes: CanonicalRoute[];
    waypoints: CanonicalWaypoint[];
  };
};

type Metadata = {
  title: string;
  description: string;
};

function getCachePath(id: string): string {
  return join(CACHE_DIR, `${id}.html`);
}

async function readCache(id: string): Promise<string | null> {
  const path = getCachePath(id);

  try {
    const fileStat = await stat(path);

    if (Date.now() - fileStat.mtimeMs >= CACHE_TTL_MS) {
      return null;
    }

    return await readFile(path, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function writeCache(id: string, html: string): Promise<void> {
  const path = getCachePath(id);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
}

function formatDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) {
    return null;
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatElevation(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) {
    return null;
  }

  return `${Math.round(meters)} m`;
}

function formatDuration(milliseconds: number | null): string | null {
  if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return null;
  }

  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  return `${minutes} min`;
}

function distanceBetween(
  from: CanonicalCoordinates,
  to: CanonicalCoordinates,
): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const deltaLat = toRadians(to[1] - from[1]);
  const deltaLon = toRadians(to[0] - from[0]);
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function getTrackDistance(track: CanonicalTrack): number {
  let totalDistanceMeters = 0;
  let previousSegmentEnd: CanonicalCoordinates | null = null;

  for (const segment of track.segments ?? []) {
    const points = segment.points ?? [];

    if (points.length === 0) {
      continue;
    }

    if (previousSegmentEnd) {
      totalDistanceMeters += distanceBetween(
        previousSegmentEnd,
        points[0].coordinates,
      );
    }

    for (let index = 1; index < points.length; index += 1) {
      totalDistanceMeters += distanceBetween(
        points[index - 1].coordinates,
        points[index].coordinates,
      );
    }

    previousSegmentEnd = points[points.length - 1].coordinates;
  }

  return totalDistanceMeters;
}

function getTrackCumulativeAscent(
  track: CanonicalTrack,
): number | null {
  let ascentMeters = 0;
  let previousElevation: number | null = null;
  let hasElevation = false;

  for (const segment of track.segments ?? []) {
    for (const point of segment.points ?? []) {
      const elevation =
        point.coordinates.length === 3
          ? point.coordinates[2]
          : null;

      if (elevation == null || !Number.isFinite(elevation)) {
        previousElevation = null;
        continue;
      }

      hasElevation = true;

      if (
        previousElevation !== null &&
        elevation > previousElevation
      ) {
        ascentMeters += elevation - previousElevation;
      }

      previousElevation = elevation;
    }
  }

  return hasElevation ? ascentMeters : null;
}

function getTrackDuration(track: CanonicalTrack): number | null {
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const segment of track.segments ?? []) {
    for (const point of segment.points ?? []) {
      if (!point.time) {
        continue;
      }

      const timestamp = Date.parse(point.time);

      if (!Number.isFinite(timestamp)) {
        continue;
      }

      if (firstTimestamp === null) {
        firstTimestamp = timestamp;
      }

      lastTimestamp = timestamp;
    }
  }

  if (firstTimestamp === null || lastTimestamp === null) {
    return null;
  }

  return Math.max(0, lastTimestamp - firstTimestamp);
}

function getRouteDistance(route: CanonicalRoute): number {
  let totalDistanceMeters = 0;

  for (let index = 1; index < route.points.length; index += 1) {
    totalDistanceMeters += distanceBetween(
      route.points[index - 1].coordinates,
      route.points[index].coordinates,
    );
  }

  return totalDistanceMeters;
}

function getRouteCumulativeAscent(
  route: CanonicalRoute,
): number | null {
  let ascentMeters = 0;
  let previousElevation: number | null = null;
  let hasElevation = false;

  for (const point of route.points) {
    const elevation =
      point.coordinates.length === 3
        ? point.coordinates[2]
        : null;

    if (elevation === null || !Number.isFinite(elevation)) {
      previousElevation = null;
      continue;
    }

    hasElevation = true;

    if (
      previousElevation !== null &&
      elevation > previousElevation
    ) {
      ascentMeters += elevation - previousElevation;
    }

    previousElevation = elevation;
  }

  return hasElevation ? ascentMeters : null;
}

function getTrackMetadata(
  tracks: CanonicalTrack[],
): Metadata | null {
  if (tracks.length === 0) {
    return null;
  }

  if (tracks.length === 1) {
    const track = tracks[0];

    const details = [
      formatDistance(getTrackDistance(track)),
      formatElevation(getTrackCumulativeAscent(track)),
      formatDuration(getTrackDuration(track)),
    ].filter(Boolean);

    return {
      title: track.name || "1 Track",
      description: [
        details[0] ? `Distance: ${details[0]}` : null,
        details[1] ? `Elevation gain: ${details[1]}` : null,
        details[2] ? `Duration: ${details[2]}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const totalDistance = tracks.reduce(
    (total, track) => total + getTrackDistance(track),
    0,
  );

  const totalAscent = tracks.reduce(
    (total, track) =>
      total + (getTrackCumulativeAscent(track) ?? 0),
    0,
  );

  return {
    title: `${tracks.length} Tracks`,
    description: [
      formatDistance(totalDistance),
      formatElevation(totalAscent),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function getRouteMetadata(
  routes: CanonicalRoute[],
): Metadata | null {
  if (routes.length === 0) {
    return null;
  }

  if (routes.length === 1) {
    const route = routes[0];

    return {
      title: route.name || "1 Route",
      description: [
        `Distance: ${formatDistance(getRouteDistance(route))}`,
        (() => {
          const ascent = getRouteCumulativeAscent(route);
          return ascent !== null
            ? `Elevation gain: ${formatElevation(ascent)}`
            : null;
        })(),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const totalDistance = routes.reduce(
    (total, route) => total + getRouteDistance(route),
    0,
  );

  const totalAscent = routes.reduce(
    (total, route) =>
      total + (getRouteCumulativeAscent(route) ?? 0),
    0,
  );

  return {
    title: `${routes.length} Routes`,
    description: [
      formatDistance(totalDistance),
      formatElevation(totalAscent),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function getWaypointMetadata(
  waypoints: CanonicalWaypoint[],
): Metadata | null {
  if (waypoints.length === 0) {
    return null;
  }

  return {
    title:
      waypoints.length === 1
        ? waypoints[0].name || "1 Waypoint"
        : `${waypoints.length} Waypoints`,
    description: "",
  };
}

function getMetadata(document: CanonicalGpxDocument): Metadata {
  return (
    getTrackMetadata(document.data.tracks) ??
    getRouteMetadata(document.data.routes) ??
    getWaypointMetadata(document.data.waypoints) ?? {
      title: "GPX Share (Beta)",
      description: "",
    }
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

router.get("/s/:id", async (c) => {
  const id = c.req.param("id");

  if (!isValidId(id)) {
    return c.text("Not Found", 404);
  }

  const cachedHtml = await readCache(id);

  if (cachedHtml !== null) {
    return c.html(cachedHtml);
  }

  const existing = inFlight.get(id);

  if (existing) {
    const html = await existing;

    return html === null
      ? c.text("Not Found", 404)
      : c.html(html);
  }

  const generation = generateShareHtml(c, id);

  inFlight.set(id, generation);

  try {
    const html = await generation;

    if (html === null) {
      return c.text("Not Found", 404);
    }

    await writeCache(id, html);

    return c.html(html);
  } finally {
    inFlight.delete(id);
  }
});

export default router;

async function generateShareHtml(
  c: Context,
  id: string,
): Promise<string | null> {
  const client = createAnemochoreClient(c);
  const response = await client.getGpx(id);

  if (response.status === 404) {
    return null;
  }

  if (response.status !== 200) {
    throw new Error(
      `Anemochore GPX retrieval failed: ${response.status}`,
    );
  }

  const canonicalDocument =
    (await response.json()) as CanonicalGpxDocument;

  const metadata = getMetadata(canonicalDocument);
  const config = getConfig();

  const shareUrl =
    `${config.xylemPublicOrigin}/s/${encodeURIComponent(id)}`;

  const ogImageUrl =
    `${config.chloroplastPublicOrigin}/og/${encodeURIComponent(id)}`;

  return viewerTemplate()
    .replaceAll(
      "{{TITLE}}",
      escapeHtmlText(`${metadata.title} - GPX Share (beta)`),
    )
    .replaceAll(
      "{{OG_TITLE}}",
      escapeHtmlAttribute(`${metadata.title} - GPX Share (beta)`),
    )
    .replaceAll(
      "{{OG_DESCRIPTION}}",
      escapeHtmlAttribute(metadata.description),
    )
    .replaceAll(
      "{{OG_URL}}",
      escapeHtmlAttribute(shareUrl),
    )
    .replaceAll(
      "{{OG_IMAGE}}",
      escapeHtmlAttribute(ogImageUrl),
    )
    .replaceAll(
      "{{ID}}",
      escapeHtmlAttribute(id),
    );
}

function viewerTemplate(): string {
  return String.raw`
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta property="og:type" content="website">
    <meta property="og:title" content="{{OG_TITLE}}">
    <meta property="og:description" content="{{OG_DESCRIPTION}}">
    <meta property="og:url" content="{{OG_URL}}">
    <meta property="og:image" content="{{OG_IMAGE}}">
    <meta name="twitter:card" content="summary_large_image">
    <title>{{TITLE}}</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.css"
    />
    <style>
      :root {
        --bg: #f5f5f4;
      }

      html,
      body {
        margin: 0;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
      }

      .app {
        height: 100%;
      }

      .app.drop-active {
        box-shadow: inset 0 0 0 4px #0f766e66;
      }

      #map {
        height: 100%;
        width: 100%;
      }
    </style>
    <script type="importmap">
      {
        "imports": {
          "leaflet": "https://unpkg.com/leaflet@2.0.0-alpha.1/dist/leaflet.js",
          "exifr": "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="app-root" class="app">
      <div id="map"></div>
    </div>

    <script type="module">
      import { createDefaultTiliaApp } from "/tilia/src/index.js";

      async function loadGpx(id) {
        const response = await fetch("/api/gpx/" + encodeURIComponent(id));
        if (!response.ok) {
          throw new Error("GPX request failed: " + response.status);
        }

        const blob = await response.blob();
        return new File([blob], id + ".gpx", {
          type: blob.type || "application/gpx+xml",
        });
      }

      const app = createDefaultTiliaApp("map", {
        baseMapOptions: { zoom: 1, center: [0.0, 139.7413575] },
        plugins: [
          "tilia-panel",
          "tilia-status",
          "tilia-base-maps-control",
          "tilia-layers",
          "tilia-elevation",
          "tilia-query-import",
          "x-gsi-base-maps",
          "x-opentopomap-base-maps",
          "x-milestone",
          "x-gpx-export"
        ],
      });
      try {
        const file = await loadGpx("{{ID}}");
        await app.load(file);
      } catch (error) {
        app.setStatus(error.message);
      }
    </script>
  </body>
</html>
  `
}
