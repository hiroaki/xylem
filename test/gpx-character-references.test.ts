import { describe, expect, it } from "vitest";
import { parseGpxXml } from "../src/gpx/parse.js";
import { processGpxInput } from "../src/gpx/process.js";
import { gpx, geometry, invalidElevation, namespace, pointKinds, policy } from "./helpers/phase-a.js";
import {
  bypassCases, invalidDecodedCoordinates, invalidReferences, namespaceSpellings, numericReferences,
} from "./helpers/xml-character-references.js";

const process = (xml: string) => processGpxInput(xml, policy);

describe("XML character references at the semantic boundary", () => {
  it.each(namespaceSpellings)("recognizes default and prefixed namespace %s", uri => {
    const expected = process(gpx('<wpt lat="0" lon="1"/>'));
    expect(process(`<gpx xmlns="${uri}"><wpt lat="0" lon="1"/></gpx>`)).toEqual(expected);
    expect(process(`<p:gpx xmlns:p="${uri}"><p:wpt lat="0" lon="1"/></p:gpx>`)).toEqual(expected);
  });
  it.each(namespaceSpellings.slice(1))("restores a rebound prefix after leaving its scope: %s", uri => {
    const xml = `<gpx xmlns="${namespace}" xmlns:p="urn:foreign"><p:wpt lat="bad"/>`
      + `<rte xmlns:p="${uri}"><p:rtept lat="0" lon="1"/></rte><p:wpt lat="bad"/></gpx>`;
    expect(process(xml).data).toEqual({ tracks: [], routes: [{ points: [{ coordinates: [1, 0] }] }], waypoints: [] });
  });
  it.each(bypassCases)("rejects $name", ({ xml }) => expect(() => process(xml)).toThrow());
  it("uses decoded URIs for reserved namespaces and duplicate expanded attributes", () => {
    expect(() => process(gpx('<wpt lat="0" lon="0" xmlns:p="http://www.w3.org/XML/1998/namespac&#101;"/>'))).toThrow();
    expect(() => process(gpx('<wpt lat="0" lon="0" xmlns:p="urn:one" xmlns:q="urn:on&#101;" p:x="a" q:x="b"/>'))).toThrow();
  });
  it("does not decode escaped references twice or reinterpret decoded text as markup", () => {
    for (const reference of ["&amp;#49;", "&#38;#49;"]) {
      const uri = `http://www.topografix.com/GPX/1/${reference}`;
      expect(() => process(`<gpx xmlns="${uri}"><wpt lat="0" lon="0"/></gpx>`)).toThrow();
      expect(process(gpx(`<wpt lat="0" lon="0"/><p:wpt xmlns:p="${uri}" lat="bad"/>`)).data.waypoints)
        .toEqual([{ coordinates: [0, 0] }]);
    }
    expect(() => process(gpx('<wpt lat="&amp;#48;" lon="0"/>'))).toThrow();
    expect(process(gpx('<wpt lat="0" lon="0"><name>&#60;wpt lat=&quot;bad&quot;/&#62; &#38;unknown;</name></wpt>')).data.waypoints)
      .toEqual([{ coordinates: [0, 0], name: '<wpt lat="bad"/> &unknown;' }]);
  });
  for (const kind of pointKinds) {
    for (const hex of [false, true]) {
      it.each([["0", "0"], ["-12.5", "+34.25"], ["90", "-180"], [" .5 ", "1."]])(
        `${kind} decodes coordinates (hex=${hex}): %s, %s`, (lat, lon) => {
          expect(process(gpx(geometry(kind, `lat="${numericReferences(lat, hex)}" lon="${numericReferences(lon, hex)}"`))))
            .toEqual(process(gpx(geometry(kind, `lat="${lat}" lon="${lon}"`))));
        },
      );
      it.each(invalidDecodedCoordinates)(`${kind} rejects decoded coordinates (hex=${hex}): %s, %s`, (lat, lon) => {
        expect(() => process(gpx(geometry(kind, `lat="${numericReferences(lat!, hex)}" lon="${numericReferences(lon!, hex)}"`)
          + '<wpt lat="0" lon="0"/>'))).toThrow();
      });
      it.each(["0", "-0", "1", "-123.456", "99999", " .5 ", ...invalidElevation])(
        `${kind} validates decoded elevation (hex=${hex}): %s`, value => {
          const encoded = process(gpx(geometry(kind, undefined, `<ele>${numericReferences(value, hex)}</ele>`)));
          expect(encoded).toEqual(process(gpx(geometry(kind, undefined, `<ele>${value}</ele>`))));
        },
      );
    }
  }
  it("decodes predefined and numeric references once, preserves CDATA, comments and first singleton rules", () => {
    const xml = gpx('<wpt lat="&#48;" lon="0"><name>&amp; &lt; &gt; &quot; &apos; &#x1F600; &amp;#49; &#38;#49; <![CDATA[&#49; &unknown;]]></name>'
      + '<ele>&amp;#49;</ele><ele>&#49;</ele></wpt><trk><trkseg><trkpt lat="0" lon="0">'
      + '<time>2026-10-18T00:00:0&#48;Z</time><ele><!-- ignored -->&#48;</ele></trkpt></trkseg></trk>');
    const data = process(xml).data;
    expect(data.waypoints).toEqual([{ coordinates: [0, 0], name: '& < > " \' 😀 &#49; &#49; &#49; &unknown;' }]);
    expect(data.tracks[0]!.segments[0]!.points).toEqual([{ coordinates: [0, 0, 0], time: "2026-10-18T00:00:00Z" }]);
    expect(parseGpxXml(gpx('<wpt lat="0" lon="0"><ele>&#38;#49;</ele></wpt>')).wpt![0]!.ele).toBe("&#49;");
    expect(parseGpxXml(gpx('<wpt lat="0" lon="0"><name>&#9;&#10;&#13;&#x10000;&#x10FFFF;</name></wpt>')).wpt![0]!.name)
      .toBe("\u{10000}\u{10ffff}");
  });
  it.each(invalidReferences)("rejects invalid reference %s even in ignored content", reference => {
    for (const xml of [
      gpx(`<wpt lat="0" lon="0"/><extensions>${reference}</extensions>`),
      gpx(`<wpt lat="0" lon="0" unused="${reference}"/>`),
      `<gpx xmlns="${namespace}${reference}"><wpt lat="0" lon="0"/></gpx>`,
    ]) expect(() => process(xml)).toThrow();
  });
  it("retains the DTD/custom/external entity prohibition", () => {
    for (const declaration of [
      '<!DOCTYPE gpx>', '<!DOCTYPE gpx [<!ENTITY x "1">]>',
      '<!DOCTYPE gpx SYSTEM "https://storage.example/entity">',
      '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
    ]) expect(() => process(declaration + gpx('<wpt lat="0" lon="0"/>'))).toThrow();
  });
});
