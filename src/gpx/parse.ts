import { XMLParser, XMLValidator } from "fast-xml-parser";

import { assertSafeGpxXml } from "./xml-security-filter.js";
import { GpxNormalizationError } from "./errors.js";

// Keep values as raw strings; canonicalize.ts is responsible for numeric/coordinate
// parsing and validation so all "is this a valid number" decisions live in one place.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) =>
    ["trk", "trkseg", "trkpt", "rte", "rtept", "wpt"].includes(tagName),
});

export type GpxPointNode = {
  lat?: string;
  lon?: string;
  ele?: string;
  time?: string;
  name?: string;
};

export type GpxTrackSegmentNode = {
  trkpt?: GpxPointNode[];
};

export type GpxTrackNode = {
  name?: string;
  trkseg?: GpxTrackSegmentNode[];
};

export type GpxRouteNode = {
  name?: string;
  rtept?: GpxPointNode[];
};

export type GpxDocumentNode = {
  trk?: GpxTrackNode[];
  rte?: GpxRouteNode[];
  wpt?: GpxPointNode[];
};

export function parseGpxXml(rawText: string): GpxDocumentNode {
  assertSafeGpxXml(rawText);

  const validation = XMLValidator.validate(rawText);
  if (validation !== true) {
    throw new GpxNormalizationError("invalid GPX file");
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(rawText);
  } catch {
    throw new GpxNormalizationError("invalid GPX file");
  }

  const gpx = (parsed as { gpx?: unknown })?.gpx;
  if (!gpx || typeof gpx !== "object") {
    throw new GpxNormalizationError("invalid GPX file");
  }

  return gpx as GpxDocumentNode;
}
