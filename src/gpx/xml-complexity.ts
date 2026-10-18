import { GpxNormalizationError } from "./errors.js";

// Inclusive budgets, enforced before allocating the XML tree. Root depth is 1.
const MAX_DEPTH = 256;
const MAX_ELEMENTS = 200_000;
const MAX_ATTRIBUTES_PER_ELEMENT = 256;

// A resource counter, not a well-formedness validator. Call only AFTER the raw
// DTD/entity ban. Quoted values and XML sections cannot contribute markup.
// Malformed/unterminated input is left to the XML library, never accepted here.
export function assertXmlComplexity(xml: string): void {
  let depth = 0;
  let elements = 0;
  for (let index = 0; index < xml.length; index += 1) {
    if (xml[index] !== "<") continue;
    const section = xml.startsWith("<!--", index) ? ["-->", 4] as const
      : xml.startsWith("<![CDATA[", index) ? ["]]>", 9] as const
        : xml.startsWith("<?", index) ? ["?>", 2] as const : null;
    if (section) {
      const end = xml.indexOf(section[0], index + section[1]);
      if (end < 0) return;
      index = end + section[0].length - 1;
      continue;
    }
    const closing = xml[index + 1] === "/";
    let quote: string | undefined;
    let attributes = 0;
    let end = index + 1;
    for (; end < xml.length; end += 1) {
      const character = xml[end];
      if (quote) { if (character === quote) quote = undefined; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === "=") {
        attributes += 1;
        // Bound even an unterminated start tag before the parser allocates its
        // attribute map. Matching/validating the tag remains the library's job.
        if (!closing && attributes > MAX_ATTRIBUTES_PER_ELEMENT) {
          throw new GpxNormalizationError("invalid GPX file");
        }
      }
      else if (character === ">") break;
    }
    if (end === xml.length) return;
    if (closing) depth -= 1;
    else {
      elements += 1;
      depth += 1;
      if (elements > MAX_ELEMENTS || depth > MAX_DEPTH) {
        throw new GpxNormalizationError("invalid GPX file");
      }
      if (xml[end - 1] === "/") depth -= 1;
    }
    index = end;
  }
}
