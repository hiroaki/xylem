import type {
  CanonicalRoutePoint,
  CanonicalCoordinates,
  CanonicalPoint,
} from "./contract.js";
import type { GpxPolicy } from "../policy.js";
import { assertValidCanonicalGpxDocument } from "./schema.js";
import { formatDecimal } from "./decimal.js";

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Literal CR/CRLF would be normalized to LF by XML parsers. Escape after &
    // so these references survive, while reference-like user text stays literal.
    .replace(/\r/g, "&#13;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function coordinateAttributes(coordinates: CanonicalCoordinates): string {
  const [lon, lat] = coordinates;
  return `lat="${escapeXmlAttribute(formatDecimal(lat))}" lon="${escapeXmlAttribute(formatDecimal(lon))}"`;
}

function elevationElement(coordinates: CanonicalCoordinates): string {
  return coordinates.length === 3 ? `<ele>${formatDecimal(coordinates[2])}</ele>` : "";
}

function trackPointElement(point: CanonicalPoint): string {
  const time = textElement("time", point.time);
  return `<trkpt ${coordinateAttributes(point.coordinates)}>${elevationElement(point.coordinates)}${time}</trkpt>`;
}

function routePointElement(point: CanonicalRoutePoint): string {
  return `<rtept ${coordinateAttributes(point.coordinates)}>${elevationElement(point.coordinates)}${textElement("time", point.time)}${textElement("name", point.name)}${textElement("desc", point.desc)}${textElement("sym", point.sym)}</rtept>`;
}

function textElement(element: "name" | "desc" | "sym" | "time", value: string | undefined): string {
  return value === undefined ? "" : `<${element}>${escapeXmlText(value)}</${element}>`;
}

// Serializes canonical data into GPX XML that Tilia's existing client-side parser can
// display — this is not a restoration of the original uploaded file (stripped fields,
// e.g. author/extensions, are gone for good and never reappear here).
export function serializeGpx(document: unknown, policy: GpxPolicy): string {
  assertValidCanonicalGpxDocument(document, policy);

  const { tracks, routes, waypoints } = document.data;

  const trackElements = tracks.map((track) => {
    const segments = track.segments
      .map((segment) => `<trkseg>${segment.points.map(trackPointElement).join("")}</trkseg>`)
      .join("");
    return `<trk>${textElement("name", track.name)}${segments}</trk>`;
  });

  const routeElements = routes.map((route) => {
    const points = route.points.map(routePointElement).join("");
    return `<rte>${textElement("name", route.name)}${textElement("desc", route.desc)}${points}</rte>`;
  });

  const waypointElements = waypoints.map(
    (waypoint) =>
      `<wpt ${coordinateAttributes(waypoint.coordinates)}>${elevationElement(waypoint.coordinates)}${textElement("name", waypoint.name)}</wpt>`,
  );

  const body = [...waypointElements, ...routeElements, ...trackElements].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Xylem" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
}
