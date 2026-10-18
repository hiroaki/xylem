import { describe, expect, it } from "vitest";
import { processGpxInput } from "../src/gpx/process.js";
import { GpxNormalizationError } from "../src/gpx/errors.js";
import { assertXmlComplexity } from "../src/gpx/xml-complexity.js";
import { policy } from "./helpers/phase-a.js";
import { attributes, cases, complexityCases } from "./helpers/xml-migration.js";

// Exercise the production string boundary; byte policy is tested through real HTTP routes.
describe("XML migration F01-F05 and declaration/complexity boundaries", () => {
  it.each([false, true])("bounds unterminated attribute maps before parsing, xmlns=%s", namespace => {
    const prefix = '<gpx><extensions><x';
    expect(() => assertXmlComplexity(prefix + attributes(257, namespace))).toThrow(GpxNormalizationError);
    // The counter does not validate unterminated syntax within its budget.
    const withinBudget = prefix + attributes(256, namespace);
    expect(() => assertXmlComplexity(withinBudget)).not.toThrow();
    expect(() => processGpxInput(withinBudget, policy)).toThrow(GpxNormalizationError);
  });
  it.each([...cases, ...complexityCases])("$id", item => {
    if (!item.expected) {
      expect(() => processGpxInput(item.xml, policy)).toThrow(GpxNormalizationError);
      return;
    }
    const data = processGpxInput(item.xml, policy).data;
    const inspect = "inspect" in item ? item.inspect : undefined;
    const point = data.waypoints[0];
    if (inspect === "route") expect(data.routes[0]?.points[0]?.coordinates).toEqual([1, 0]);
    else if (inspect === "100-points") expect(data.routes[0]?.points).toHaveLength(100);
    else {
      expect(point?.coordinates).toEqual(inspect === "one" ? [1, 1] : inspect === "elevation" ? [1, 0, 1] : inspect === "zero-elevation" ? [1, 0, 0] : [1, 0]);
      if (inspect === "pi") expect(point?.name).toBe("AB");
      if (inspect === "single-pass") expect(point?.name).toBe("&#49; &#49; &unknown;");
      if (inspect === "cdata") expect(point?.name).toBe("A&#0; &unknown;BC");
      if (inspect === "max-unicode") expect(point?.name).toBe("A\u{10ffff}B");
    }
  });
  for (const hex of [false, true]) for (const kind of ["wpt", "rtept", "trkpt"]) {
    const uri = "http://www.topografix.com/GPX/1/" + `&#${hex ? "x" : ""}${"0".repeat(40)}${hex ? "31" : "49"};`;
    it(`rejects long-reference misplaced ${kind}/${hex}`, () => {
      expect(() => processGpxInput(`<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:p="${uri}"><wpt lat="0" lon="1"/><extensions><p:${kind} lat="bad" lon="0"/></extensions></gpx>`, policy)).toThrow(GpxNormalizationError);
    });
    if (kind === "rtept") it(`rejects long-reference 101 route points/${hex}`, () => {
      expect(() => processGpxInput(`<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:p="${uri}"><rte>${'<p:rtept lat="0" lon="1"/>'.repeat(101)}</rte></gpx>`, policy)).toThrow(GpxNormalizationError);
    });
  }
});
