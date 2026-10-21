import { describe, expect, it } from "vitest";
import { processGpxBytes } from "../src/gpx/process.js";
import { parseGpxXml } from "../src/gpx/parse.js";
import { GpxNormalizationError } from "../src/gpx/errors.js";
import { assertXmlDeclarationGrammar } from "../src/gpx/xml-declaration.js";
import { policy } from "./helpers/phase-a.js";
import { declarationsOutsidePolicy, xmlDeclarationCases } from "./helpers/xml-declarations.js";

describe("XML declaration original-text grammar and retained policy", () => {
  it.each(declarationsOutsidePolicy)("keeps grammar distinct from version/encoding policy: %s", declaration => {
    expect(() => assertXmlDeclarationGrammar(declaration)).not.toThrow();
    expect(() => processGpxBytes(Buffer.from(declaration + '<gpx><wpt lat="0" lon="1"/></gpx>'), policy)).toThrow(GpxNormalizationError);
  });
  it.each(xmlDeclarationCases)("$id", ({ xml, expected }) => {
    if (!expected) {
      expect(() => processGpxBytes(Buffer.from(xml), policy)).toThrow(GpxNormalizationError);
      return;
    }
    expect(processGpxBytes(Buffer.from(xml), policy).data.waypoints[0]?.coordinates).toEqual([1, 0]);
    // The string parser also accepts the optional BOM without changing the AST.
    expect(parseGpxXml(xml).wpt?.[0]).toMatchObject({ lat: "0", lon: "1" });
  });
});
