import { describe, expect, it } from "vitest";
import { parseGpxXml } from "../src/gpx/parse.js";
import { processGpxInput } from "../src/gpx/process.js";
import { serializeGpx } from "../src/gpx/serialize.js";
import { assertValidCanonicalGpxDocument } from "../src/gpx/schema.js";
import { gpx, policy } from "./helpers/phase-a.js";
import { validTimes, invalidTimes } from "./helpers/phase-b.js";
import { richGpx, expectedCanonical, invalidB5Inputs } from "./helpers/phase-b5.js";

const routeDocument = (route: string) => processGpxInput(gpx(`<rte>${route}</rte><wpt lat="0" lon="0"/>`), policy);
const fields = [
  ["route name", "name", false, 256], ["route desc", "desc", false, 4096],
  ["point name", "name", true, 256], ["point desc", "desc", true, 4096],
  ["point sym", "sym", true, 128],
] as const;

describe("B5 route input", () => {
  it("parses the approved direct-child AST fields", () => {
    expect(parseGpxXml(richGpx).rte?.[1]).toMatchObject({
      name: "山道", desc: "第一行\n第二行 <安全>", rtept: [
        {lat: "35", lon: "139", ele: "0", time: "2026-10-19T12:34:56.123456+09:00", name: "出発 😀", desc: 'A & B <C> "D"', sym: "Flag"},
        {lat: "35", lon: "139", name: "二番目", time: "2026-10-19T03:35:00.50Z"},
        {lat: "35", lon: "139", name: "三番目", desc: "別の説明", sym: "Summit", time: "2026-10-19T04:00:00Z"},
      ],
    });
  });
  it("matches an independent canonical expectation and round-trips through B2", () => {
    const canonical = processGpxInput(richGpx, policy);
    expect(canonical).toEqual(expectedCanonical);
    expect(() => assertValidCanonicalGpxDocument(canonical, policy)).not.toThrow();
    const xml = serializeGpx(canonical, policy);
    expect(xml).toContain('lat="0.0000001" lon="-0.0000001"');
    expect(xml).toContain("A &amp; B &lt;C&gt;");
    expect(processGpxInput(xml, policy)).toEqual(expectedCanonical);
  });
  for (const [label, field, point, limit] of fields) {
    const select = (content: string) => {
      const d = routeDocument(point ? `<rtept lat="0" lon="0">${content}</rtept>` : content);
      return point ? d.data.routes[0].points[0] : d.data.routes[0];
    };
    it.each([limit - 1, limit, limit + 1])(`${label}: %i Unicode code points`, length => {
      const value = "😀".repeat(length);
      const actual = select(`<${field}> ${value} </${field}>`);
      const expected = length <= limit ? value : field === "sym" ? undefined : "😀".repeat(limit - 1) + "…";
      if (expected === undefined) expect(actual).not.toHaveProperty(field);
      else expect(actual).toHaveProperty(field, expected);
    });
    it(`${label}: missing, blank and structured first values are omitted without fallback`, () => {
      expect(select("")).not.toHaveProperty(field);
      for (const value of ["", " \t\n ", "<child>nested</child>"]) {
        expect(select(`<${field}>${value}</${field}><${field}>fallback</${field}>`)).not.toHaveProperty(field);
      }
    });
    it(`${label}: first matching namespace singleton and direct children only`, () => {
      const content = `<x:${field} xmlns:x="urn:foreign">foreign</x:${field}>
        <extensions><${field}>nested</${field}></extensions>
        <${field}> first\t😀\n&amp; &lt;ok&gt; </${field}><${field}>second</${field}>`;
      expect(select(content)).toHaveProperty(field, "first\t😀\n& <ok>");
      expect(select(`<${field} xmlns="urn:foreign">foreign</${field}>`)).not.toHaveProperty(field);
    });
    it(`${label}: an overlong first singleton cannot fall back to a later value`, () => {
      const actual = select(`<${field}>${"😀".repeat(limit + 1)}</${field}><${field}>fallback</${field}>`);
      if (field === "sym") expect(actual).not.toHaveProperty(field);
      else expect(actual).toHaveProperty(field, "😀".repeat(limit - 1) + "…");
    });
    it(`${label}: invalid XML characters still reject the entire input`, () => {
      expect(() => select(`<${field}>&#0;</${field}>`)).toThrow();
    });
  }
  it.each(validTimes.map((time, index) => ({time, index})))("retains route time $index exactly", ({time}) => {
    const d = routeDocument(`<rtept lat="0" lon="0"><time> ${time} </time></rtept>`);
    expect(d.data.routes[0].points[0].time).toBe(time);
  });
  it("applies direct-child namespace and first-singleton rules to route-point time", () => {
    const time = "2026-01-01T00:00:00.00100+09:00";
    const point = (content: string) => routeDocument(`<rtept lat="0" lon="0">${content}</rtept>`).data.routes[0].points[0];
    expect(point(`<x:time xmlns:x="urn:foreign">foreign</x:time><extensions><time>nested</time></extensions><time>${time}</time><time>2025-01-01T00:00:00Z</time>`).time).toBe(time);
    for (const first of ["", " \n ", "<child/>"]) {
      expect(point(`<time>${first}</time><time>${time}</time>`)).not.toHaveProperty("time");
    }
  });
  it.each(["", "g:"])("accepts namespace-free and prefixed GPX metadata (%s)", prefix => {
    const body = '<gpx><rte><name>route</name><desc>description</desc><rtept lat="1" lon="2"><name>point</name><desc>details</desc><sym>Flag</sym><time>2026-01-01T00:00:00Z</time></rtept></rte></gpx>';
    const xml = prefix ? body.replace(/<(\/?)([a-z]+)/g, `<$1${prefix}$2`).replace('<g:gpx>', '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1">') : body;
    expect(processGpxInput(xml, policy).data.routes).toEqual([{name: "route", desc: "description", points: [
      {coordinates: [2, 1], name: "point", desc: "details", sym: "Flag", time: "2026-01-01T00:00:00Z"},
    ]}]);
  });
  it.each(invalidTimes.filter(time => time.trim() === time).map((time, index) => ({time, index})))("omits invalid first route time $index", ({time}) => {
    const d = routeDocument(`<rtept lat="0" lon="0"><time>${time}</time><time>2026-01-01T00:00:00Z</time></rtept>`);
    expect(d.data.routes[0].points[0]).not.toHaveProperty("time");
  });
  it.each(["<wpt lat=\"0\" lon=\"0\"/>", "<trk><trkseg/><trkseg><trkpt lat=\"0\" lon=\"0\"/></trkseg></trk>", "<rte><rtept lat=\"0\" lon=\"0\"/></rte>"])("retains empty routes with actual geometry: %s", geometry => {
    const d = processGpxInput(gpx(`<rte><name>empty</name><desc>plan</desc></rte><rte/>${geometry}`), policy);
    expect(d.data.routes.slice(0, 2)).toEqual([{name: "empty", desc: "plan", points: []}, {points: []}]);
  });
  it.each(invalidB5Inputs)("rejects %s", (_label, xml) => {
    expect(() => processGpxInput(xml, policy)).toThrow();
  });
  it("counts empty routes at the configured boundary and preserves point budgets", () => {
    const xml = gpx('<rte/>'.repeat(19) + '<rte><rtept lat="0" lon="0"/><rtept lat="0" lon="0"/></rte>');
    expect(processGpxInput(xml, policy).data.routes).toHaveLength(20);
    for (const override of [{maxRoutes: 19}, {maxRoutePointsPerRoute: 1}, {maxTotalPoints: 1}]) {
      expect(() => processGpxInput(xml, {...policy, ...override})).toThrow();
    }
  });
  it("does not expand unrelated track/waypoint or route-container metadata", () => {
    const extra = '<desc>ignored</desc><sym>ignored</sym><time>2026-01-01T00:00:00Z</time>';
    const d = processGpxInput(gpx(`<rte>${extra}</rte><wpt lat="0" lon="0">${extra}</wpt><trk>${extra}<trkseg><trkpt lat="0" lon="0"><name>ignored</name>${extra}</trkpt></trkseg></trk>`), policy);
    expect(d.data.routes).toEqual([{desc: "ignored", points: []}]);
    expect(d.data.waypoints).toEqual([{coordinates: [0, 0]}]);
    expect(d.data.tracks).toEqual([{segments: [{points: [{coordinates: [0, 0], time: "2026-01-01T00:00:00Z"}]}]}]);
  });
});
