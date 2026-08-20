import type {
  CanonicalGpxDocument,
  CanonicalRoutePoint,
  CanonicalCoordinates,
  CanonicalPoint,
} from "./canonicalize.js";
import { GpxNormalizationError } from "./errors.js";

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function coordinateAttributes(coordinates: CanonicalCoordinates): string {
  const [lon, lat] = coordinates;
  return `lat="${escapeXmlAttribute(String(lat))}" lon="${escapeXmlAttribute(String(lon))}"`;
}

function elevationElement(coordinates: CanonicalCoordinates): string {
  return coordinates.length === 3 ? `<ele>${coordinates[2]}</ele>` : "";
}

function trackPointElement(point: CanonicalPoint): string {
  const time = point.time ? `<time>${escapeXmlText(point.time)}</time>` : "";
  return `<trkpt ${coordinateAttributes(point.coordinates)}>${elevationElement(point.coordinates)}${time}</trkpt>`;
}

function routePointElement(point: CanonicalRoutePoint): string {
  return `<rtept ${coordinateAttributes(point.coordinates)}>${elevationElement(point.coordinates)}</rtept>`;
}

function nameElement(name: string | undefined): string {
  return name ? `<name>${escapeXmlText(name)}</name>` : "";
}

// Serializes canonical data into GPX XML that Tilia's existing client-side parser can
// display — this is not a restoration of the original uploaded file (stripped fields,
// e.g. author/extensions, are gone for good and never reappear here).
export function serializeGpx(document: CanonicalGpxDocument): string {
  if (document.data_type !== "gpx") {
    throw new GpxNormalizationError('cannot serialize non-"gpx" canonical document');
  }

  const { tracks, routes, waypoints } = document.data;

  const trackElements = tracks.map((track) => {
    const segments = track.segments
      .map((segment) => `<trkseg>${segment.points.map(trackPointElement).join("")}</trkseg>`)
      .join("");
    return `<trk>${nameElement(track.name)}${segments}</trk>`;
  });

  const routeElements = routes.map((route) => {
    const points = route.points.map(routePointElement).join("");
    return `<rte>${nameElement(route.name)}${points}</rte>`;
  });

  const waypointElements = waypoints.map(
    (waypoint) =>
      `<wpt ${coordinateAttributes(waypoint.coordinates)}>${elevationElement(waypoint.coordinates)}${nameElement(waypoint.name)}</wpt>`,
  );

  const body = [...waypointElements, ...routeElements, ...trackElements].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Xylem" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
}
