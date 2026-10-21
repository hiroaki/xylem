import { gpx, namespace, pointKinds } from "./phase-a.js";

export const namespaceSpellings = [
  namespace,
  "http://www.topografix.com/GPX/1/&#49;",
  "http://www.topografix.com/GPX/1/&#x31;",
];
export const numericReferences = (value: string, hex = false) => [...value].map(character =>
  hex ? `&#x${character.codePointAt(0)!.toString(16)};` : `&#${character.codePointAt(0)!};`,
).join("");

export const invalidDecodedCoordinates = [
  ["", "0"], ["1e1", "0"], ["0x10", "0"], ["NaN", "0"], ["Infinity", "0"],
  ["91", "0"], ["-91", "0"], ["0", "180"], ["0", "-181"], ["\u00a00", "0"],
  ["&#48;", "0"], // A reference obtained by decoding must stay literal.
];
export const invalidReferences = [
  "&#;", "&#x;", "&#X31;", "&#-1;", "&#xGG;", "&#49", "&amp", "&unknown;", "&nbsp;",
  "&#0;", "&#x1;", "&#11;", "&#xD800;", "&#xDFFF;", "&#65534;", "&#xFFFF;", "&#x110000;",
];

export const bypassCases = namespaceSpellings.slice(1).flatMap(uri => [
  ...pointKinds.flatMap(kind => [
    {
      name: `misplaced ${kind}, valid coordinates, ${uri}`,
      xml: gpx(`<wpt lat="0" lon="0"/><extensions xmlns:p="${uri}"><p:${kind} lat="0" lon="0"/></extensions>`),
    },
    {
      name: `misplaced ${kind}, invalid coordinates, rebound ${uri}`,
      xml: gpx(`<wpt lat="0" lon="0"/><extensions xmlns:p="urn:foreign"><p:${kind} xmlns:p="${uri}" lat="bad" lon="0"/></extensions>`),
    },
  ]),
  {
    name: `encoded route count overflow, ${uri}`,
    xml: gpx(`<wpt lat="0" lon="0"/><extensions/>` + `<rte xmlns="${uri}"/>`.repeat(21)),
  },
  {
    name: `encoded route point count overflow, ${uri}`,
    xml: gpx(`<wpt lat="0" lon="0"/><rte xmlns:p="${uri}">` + '<p:rtept lat="0" lon="0"/>'.repeat(101) + "</rte>"),
  },
]);
