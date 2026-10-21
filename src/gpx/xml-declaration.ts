import { GpxNormalizationError } from "./errors.js";

// XML 1.0 productions XMLDecl, VersionInfo, Eq, SDDecl, EncodingDecl, EncName:
// https://www.w3.org/TR/REC-xml/#NT-XMLDecl
// Use XML S, not JS \s; require matched quotes and whitespace before each field.
const space = "[ \\t\\r\\n]";
const equal = `${space}*=${space}*`;
const version = /(?:"1\.[0-9]+"|'1\.[0-9]+')/.source;
const encoding = /(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*')/.source;
const standalone = /(?:"(?:yes|no)"|'(?:yes|no)')/.source;
const declaration = new RegExp(
  `^\uFEFF?<\\?xml${space}+version${equal}${version}`
  + `(?:${space}+encoding${equal}${encoding})?`
  + `(?:${space}+standalone${equal}${standalone})?${space}*\\?>`,
);

// Called only when the library parsed a declaration. Match the ORIGINAL prolog
// prefix (before EOL normalization), not metadata that loses empty fields and
// separators. The XML library still validates the document and prolog position;
// parsed version/encoding policy checks still enforce exactly 1.0 and UTF-8.
export function assertXmlDeclarationGrammar(rawXml: string): void {
  if (!declaration.test(rawXml)) throw new GpxNormalizationError("invalid GPX file");
}
