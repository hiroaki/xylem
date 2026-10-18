import { parseXml, XmlCdata, XmlDeclaration, XmlElement, XmlError, XmlText } from "@rgrove/parse-xml";
import { GpxNormalizationError } from "./errors.js";
import { assertSafeGpxXml, isXmlNcName } from "./xml-security-filter.js";
import { assertXmlComplexity } from "./xml-complexity.js";
import { assertXmlDeclarationGrammar } from "./xml-declaration.js";

const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const geographic = new Set(["gpx", "trk", "trkseg", "trkpt", "rte", "rtept", "wpt"]);
const parents: Record<string, string> = { trk: "gpx", rte: "gpx", wpt: "gpx", trkseg: "trk", trkpt: "trkseg", rtept: "rte" };

export type GpxPointNode = { lat?: string; lon?: string; ele?: string; time?: string; name?: string };
export type GpxTrackSegmentNode = { trkpt?: GpxPointNode[] };
export type GpxTrackNode = { name?: string; trkseg?: GpxTrackSegmentNode[] };
export type GpxRouteNode = { name?: string; rtept?: GpxPointNode[] };
export type GpxDocumentNode = { trk?: GpxTrackNode[]; rte?: GpxRouteNode[]; wpt?: GpxPointNode[] };

type Geography = GpxDocumentNode & GpxTrackNode & GpxTrackSegmentNode & GpxRouteNode & GpxPointNode;
type Element = { kind: string; value?: Geography; seen: Set<string> };
function fail(): never { throw new GpxNormalizationError("invalid GPX file"); }
function simpleText(children: XmlElement["children"]): string | undefined {
  if (children.some(node => node instanceof XmlElement)) return undefined;
  return children.map(node => node instanceof XmlText || node instanceof XmlCdata ? node.text : "").join("").trim() || undefined;
}

// Produces a small typed AST only after checking the complete XML tree,
// including ignored subtrees. No recursive walk of producer-controlled depth.
export function parseGpxXml(rawText: string, maxRawBytes = Number.POSITIVE_INFINITY): GpxDocumentNode {
  assertSafeGpxXml(rawText, maxRawBytes);
  assertXmlComplexity(rawText);
  let parsed;
  try {
    // Normalize raw line endings once; references such as &#13; remain intact.
    parsed = parseXml(rawText.replace(/\r\n?/g, "\n"), {
      preserveXmlDeclaration: true,
      preserveCdata: true,
    });
  } catch (error) {
    // XmlError contains private source excerpts. Never retain or forward it.
    if (error instanceof XmlError) fail();
    throw error;
  }
  const declaration = parsed.children.find(node => node instanceof XmlDeclaration);
  if (declaration) assertXmlDeclarationGrammar(rawText);
  if (declaration && (declaration.version !== "1.0"
    || (declaration.encoding !== null && declaration.encoding.toUpperCase() !== "UTF-8"))) fail();
  const root = parsed.root;
  if (!root) fail();

  const bindings = new Map<string, string>([["xml", XML_NAMESPACE], ["", ""]]);
  const document: GpxDocumentNode = {};
  type Work = { node: XmlElement; parent?: Element } | { undo: [string, string | undefined][] };
  const work: Work[] = [{ node: root }];
  let rootNamespace: string | undefined;
  while (work.length) {
    const task = work.pop()!;
    if ("undo" in task) {
      for (const [prefix, previous] of task.undo) {
        if (previous === undefined) bindings.delete(prefix); else bindings.set(prefix, previous);
      }
      continue;
    }
    const { node, parent } = task;
    const qualifiedName = node.name;
    const children = node.children;
    const attributes = node.attributes;
    const undo: [string, string | undefined][] = [];
    for (const [name, uri] of Object.entries(attributes)) {
      if (name !== "xmlns" && !name.startsWith("xmlns:")) continue;
      const prefix = name === "xmlns" ? "" : name.slice(6);
      if ((prefix !== "" && !isXmlNcName(prefix)) || prefix === "xmlns" || uri === XMLNS_NAMESPACE
        || (prefix === "xml" ? uri !== XML_NAMESPACE : uri === XML_NAMESPACE)
        || (prefix !== "" && uri === "")) fail();
      undo.push([prefix, bindings.get(prefix)]);
      bindings.set(prefix, uri);
    }
    function resolve(name: string, attribute = false): [string, string] {
      const parts = name.split(":");
      if (parts.length > 2 || parts.some(part => !isXmlNcName(part))) fail();
      if (parts.length === 1) return [attribute ? "" : bindings.get("")!, name];
      const uri = bindings.get(parts[0]!);
      if (!uri || parts[0] === "xmlns") fail();
      return [uri, parts[1]!];
    }
    const [uri, local] = resolve(qualifiedName);
    const expandedAttributes = new Set<string>();
    for (const name of Object.keys(attributes)) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const [attributeUri, attributeLocal] = resolve(name, true);
      const identity = JSON.stringify([attributeUri, attributeLocal]);
      if (expandedAttributes.has(identity)) fail();
      expandedAttributes.add(identity);
    }
    const current: Element = { kind: local, seen: new Set() };
    if (!parent) {
      if (local !== "gpx" || (uri !== "" && uri !== GPX_NAMESPACE)) fail();
      const version = attributes["version"];
      if (version !== undefined && version.trim() !== "1.1") fail();
      rootNamespace = uri;
      current.value = document;
    } else if (uri === rootNamespace && geographic.has(local)) {
      if (!parent.value || parents[local] !== parent.kind) fail();
      const value: Geography = {};
      // Only actual unqualified XML attributes can supply coordinates.
      if (["wpt", "rtept", "trkpt"].includes(local)) {
        value.lat = attributes["lat"];
        value.lon = attributes["lon"];
      }
      const target = parent.value as Record<string, unknown>;
      const collection = (target[local] ??= []) as Geography[];
      collection.push(value);
      current.value = value;
    } else if (uri === rootNamespace && parent.value && ["name", "ele", "time"].includes(local) && !parent.seen.has(local)) {
      parent.seen.add(local);
      const text = simpleText(children);
      if (text !== undefined) (parent.value as Record<string,string>)[local] = text;
    }
    work.push({ undo });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]!;
      if (child instanceof XmlElement) work.push({ node: child, parent: current });
      else if (current.value && (child instanceof XmlText || child instanceof XmlCdata) && child.text.trim() !== "") fail();
    }
  }
  return document;
}
