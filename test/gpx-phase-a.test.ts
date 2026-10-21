import { describe, expect, it } from "vitest";
import { canonicalizeGpx } from "../src/gpx/canonicalize.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { assertSafeGpxXml } from "../src/gpx/xml-security-filter.js";
import { assertValidCanonicalGpxDocument } from "../src/gpx/schema.js";
import { gpx, geometry, invalidCoordinates, invalidElevation, namespace, pointKinds, policy, validCoordinates, validElevation } from "./helpers/phase-a.js";

function normalize(xml: string, overrides = {}) {
  const limits = { ...policy, ...overrides };
  assertSafeGpxXml(xml, limits.maxRawBytes);
  const result = canonicalizeGpx(parseGpxXml(xml), limits);
  assertValidCanonicalGpxDocument(result, limits);
  return result;
}
function coordinates(xml: string) {
  const { tracks, routes, waypoints } = normalize(xml).data;
  return (waypoints[0] ?? routes[0]?.points[0] ?? tracks[0]?.segments[0]?.points[0])!.coordinates;
}

for (const kind of pointKinds) describe(kind, () => {
  it.each(invalidCoordinates)("C01-C03 rejects entire mixed document: %s", attributes => {
    expect(() => normalize(gpx(geometry(kind, attributes) + '<wpt lat="1" lon="2"/>'))).toThrow();
  });
  it.each([0, 1, 2])("C01 rejects an invalid point at position %i without retaining its neighbors", position => {
    const points = [0, 1, 2].map(index => `<${kind} lat="${index === position ? 'bad' : '0'}" lon="0"/>`).join("");
    const body = kind === "wpt" ? points : kind === "rtept" ? `<rte>${points}</rte>` : `<trk><trkseg>${points}</trkseg></trk>`;
    expect(() => normalize(gpx(body))).toThrow("invalid GPX coordinates");
  });
  it.each(validCoordinates)("C03 accepts %s", (attributes, expected) => {
    expect(coordinates(gpx(geometry(kind, attributes)))).toEqual(expected);
  });
  it.each(validElevation)("E01 retains elevation %s", value => {
    expect(coordinates(gpx(geometry(kind, undefined, `<ele>${value}</ele>`)))).toEqual([0, 0, Number(value)]);
  });
  it.each(invalidElevation)("E02-E04 omits elevation %s", value => {
    expect(coordinates(gpx(geometry(kind, undefined, `<ele>${value}</ele>`)))).toEqual([0, 0]);
  });
  it("C04 distinguishes attributes from child elements and foreign attributes", () => {
    for (const [attributes, content] of [
      ['lon="1"', '<lat>1</lat>'], ['xmlns:f="urn:foreign" f:lat="1" lon="1"', ""],
    ]) expect(() => normalize(gpx(geometry(kind, attributes, content)))).toThrow();
    expect(coordinates(gpx(geometry(kind, 'lat="0" lon="1"', '<lat>85</lat><lon>90</lon>')))).toEqual([1, 0]);
  });
  it("E04 selects only the first direct elevation and omits structured values", () => {
    for (const content of ['<ele/><ele>5</ele>', '<ele>bad</ele><ele>5</ele>', '<ele><value>5</value></ele><ele>6</ele>', '<ele xmlns="urn:foreign">7</ele>']) {
      expect(coordinates(gpx(geometry(kind, undefined, content)))).toEqual([0, 0]);
    }
    expect(coordinates(gpx(geometry(kind, undefined, '<ele>0</ele><ele>7</ele>')))).toEqual([0, 0, 0]);
    expect(coordinates(gpx(geometry(kind, undefined, '<ele xmlns="urn:foreign">7</ele><ele>0</ele>')))).toEqual([0, 0, 0]);
  });
});

describe("D12 XML interpretation", () => {
  it.each([
    '<gpx><wpt lat="0" lon="0"/></gpx>',
    `<a:gpx xmlns:a="${namespace}"><a:wpt lat="0" lon="0"/></a:gpx>`,
    `<gpx xmlns="${namespace}"><p:wpt xmlns:p="${namespace}" lat="0" lon="0"/></gpx>`,
    '<gpx><!--comment--><wpt lat="0" lon="0"/></gpx>',
    '<gpx><外国 xmlns="urn:foreign" 属性="safe"/><wpt lat="0" lon="0"/></gpx>',
  ])("N01 accepts compatible input %s", xml => expect(coordinates(xml)).toEqual([0, 0]));
  it.each([
    '<gpx xmlns="urn:foreign"><wpt lat="0" lon="0"/></gpx>',
    '<gpx xmlns="http://www.topografix.com/GPX/1/0"><wpt lat="0" lon="0"/></gpx>',
    ...['1.0', '', '2.0'].map(version => `<gpx version="${version}"><wpt lat="0" lon="0"/></gpx>`),
    '<root><gpx><wpt lat="0" lon="0"/></gpx></root>', '<gpx/><gpx><wpt lat="0" lon="0"/></gpx>',
    '<gpx>outside geometry<wpt lat="0" lon="0"/></gpx>garbage',
    '<gpx><a:wpt lat="0" lon="0"/></gpx>',
    '<gpx xmlns:xml="urn:wrong"><wpt lat="0" lon="0"/></gpx>',
    '<gpx xmlns:a="urn:x" xmlns:b="urn:x" a:x="1" b:x="2"><wpt lat="0" lon="0"/></gpx>',
  ])("N02-N04 rejects invalid root/XML/namespace %s", xml => expect(() => normalize(xml)).toThrow());
  it("N02/N04 handles rebinding and namespace resets without importing foreign geometry", () => {
    const xml = `<a:gpx xmlns:a="${namespace}"><a:wpt lat="0" lon="0"/><other xmlns:a="urn:foreign"><a:wpt/></other><rte xmlns=""/><a:wpt xmlns:a="urn:foreign"/><a:wpt lat="1" lon="2"/></a:gpx>`;
    expect(normalize(xml).data.waypoints).toEqual([{coordinates: [0, 0]}, {coordinates: [2, 1]}]);
  });
  it.each([
    '<rtept lat="0" lon="0"/>', '<trkpt lat="0" lon="0"/>', '<trkseg/>',
    '<extensions><wpt lat="0" lon="0"/></extensions>', '<rte><wpt lat="0" lon="0"/></rte>',
    '<trk><trkpt lat="0" lon="0"/></trk>', '<rte><extensions><rtept lat="0" lon="0"/></extensions></rte>',
    '<wpt lat="0" lon="0"><name><rte/></name></wpt>',
    '<foreign xmlns="urn:other"><wpt xmlns="http://www.topografix.com/GPX/1/1" lat="0" lon="0"/></foreign>',
  ])("N05 rejects misplaced GPX geography inside %s", body => expect(() => normalize(gpx(body + '<wpt lat="1" lon="2"/>'))).toThrow());
});

describe("D16 document-wide XML safety", () => {
  it.each(['\u0000', '\u0001', '\u000b', '\ufffe', '\uffff', '\ud800', '&#0;', '&#xB;', '&#xD800;', '&#x110000;', '&unknown;'])('X02 rejects ignored invalid text %s', text => {
    expect(() => normalize(gpx(`<wpt lat="0" lon="0"/><extensions><ignored>${text}</ignored></extensions>`))).toThrow();
  });
  it.each([
    '<![CDATA[x]]><gpx><wpt lat="0" lon="0"/></gpx>',
    '<gpx><!--bad---><wpt lat="0" lon="0"/></gpx>',
    '<gpx><extensions>]]></extensions><wpt lat="0" lon="0"/></gpx>',
    '<gpx><![CDATA[unexpected text]]><wpt lat="0" lon="0"/></gpx>',
    '<gpx xmlns:a="urn:x"><a:1invalid/><wpt lat="0" lon="0"/></gpx>',
    '<?xml?><gpx><wpt lat="0" lon="0"/></gpx>',
    '<??><gpx><wpt lat="0" lon="0"/></gpx>',
    '<?1invalid?><gpx><wpt lat="0" lon="0"/></gpx>',
    '<?XML version="1.0"?><gpx><wpt lat="0" lon="0"/></gpx>',
    '<gpx><wpt lat="0" lon="0" x="a<b"/></gpx>',
  ])("S01 rejects malformed XML/structure %s", xml => expect(() => normalize(xml)).toThrow());
  it("X01 accepts XML-legal Unicode, predefined entities, character references and literal CDATA", () => {
    expect(() => normalize(gpx('<wpt lat="0" lon="0"/><extensions safe="]]>">日本😀\u007f &amp; &#9; <![CDATA[&#0; &unknown;]]><!-- &#0; --><?説明 safe?></extensions>'))).not.toThrow();
  });
  it.each(['<!DOCTYPE gpx><gpx/>', '<!ENTITY x "y"><gpx/>', '<gpx><wpt></gpx>', '<gpx/><?unfinished'])('S01 rejects unsafe/malformed XML %s', xml => expect(() => normalize(xml)).toThrow());
});

describe("Phase A canonical numeric consistency", () => {
  it.each([[180, 0], [-180.001, 0], [0, 91], [0, 0, 99999.001], [0, 0, -99999.001], [0, 0, Infinity]])("rejects canonical coordinates %j", (...value) => {
    // Table rows are coordinate tuples, not original XML lexical spellings.
    expect(() => assertValidCanonicalGpxDocument({ schema_version: 1, data_type: "gpx", data: { tracks: [], routes: [], waypoints: [{ coordinates: value }] } }, policy)).toThrow();
  });
});

describe("D14 and existing resource/geometry behavior", () => {
  it("L02/L05 counts empty routes before removal and enforces equality", () => {
    expect(() => normalize(gpx('<rte/>'.repeat(20) + '<wpt lat="0" lon="0"/>'))).not.toThrow();
    expect(() => normalize(gpx('<rte/>'.repeat(21) + '<wpt lat="0" lon="0"/>'))).toThrow(/routes/);
    expect(() => normalize(gpx('<rte/><rte/><wpt lat="0" lon="0"/>'), {maxRoutes: 1})).toThrow(/routes/);
  });
  it("L02/L05 enforces each route independently, not tracks or waypoints", () => {
    const pt = '<rtept lat="0" lon="0"/>';
    expect(normalize(gpx(`<rte>${pt.repeat(100)}</rte><rte>${pt.repeat(100)}</rte>`)).data.routes).toHaveLength(2);
    expect(() => normalize(gpx(`<rte>${pt.repeat(101)}</rte>`))).toThrow(/route points/);
    expect(() => normalize(gpx('<wpt lat="0" lon="0"/>'.repeat(101) + '<trk><trkseg>' + '<trkpt lat="0" lon="0"/>'.repeat(101) + '</trkseg></trk>'))).not.toThrow();
  });
  it("G01/G05/G06 keeps single points and removes only empty track containers", () => {
    const c = normalize(gpx('<trk><name>Removed</name><trkseg/></trk><trk><trkseg/><trkseg><trkpt lat="0" lon="0"/></trkseg></trk>'));
    expect(c.data.tracks).toEqual([{segments: [{points: [{coordinates: [0, 0]}]}]}]);
    expect(() => normalize(gpx('<trk><trkseg/></trk><rte/>'))).toThrow();
  });
  it("L01 counts every category and rejects a point over budget before coordinate conversion", () => {
    expect(() => normalize(gpx('<wpt lat="0" lon="0"/>' + geometry('rtept') + geometry('trkpt')), {maxTotalPoints: 3})).not.toThrow();
    expect(() => normalize(gpx('<wpt lat="bad" lon="0"/>' + geometry('rtept') + geometry('trkpt')), {maxTotalPoints: 2})).toThrow(/max total points/);
  });
});
