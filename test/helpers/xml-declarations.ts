const document = '<gpx><wpt lat="0" lon="1"/></gpx>';

export const confirmedMalformedDeclarations = [
  '<?xml version="1.0" encoding=""?>',
  '<?xml version="1.0" standalone=""?>',
  '<?xml version="1.0" encoding="UTF-8"standalone="yes"?>',
];

const validDeclarations = [
  '<?xml version="1.0"?>',
  "<?xml version='1.0'?>",
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<?xml version='1.0' encoding='uTf-8'?>",
  ...["yes", "no"].flatMap(value => [
    `<?xml version="1.0" standalone="${value}"?>`,
    `<?xml version='1.0' standalone='${value}'?>`,
    `<?xml version="1.0" encoding='UTF-8' standalone="${value}"?>`,
    `<?xml version='1.0' encoding="utf-8" standalone='${value}'?>`,
  ]),
  ...[" ", "\t", "\r", "\n", "\r\n"].map(space =>
    `<?xml${space}version${space}=${space}"1.0"${space}encoding${space}=${space}'UTF-8'${space}standalone${space}=${space}"yes"${space}?>`),
];

const malformedDeclarations = [
  ...confirmedMalformedDeclarations,
  "<?xml version='1.0' encoding=''?>",
  "<?xml version='1.0' standalone=''?>",
  '<?xml?>', '<?xml ?>', '<?xml encoding="UTF-8"?>', '<?xml standalone="yes"?>',
  '<?xml version=""?>', '<?xml version=1.0?>', '<?xml version="1.0?>',
  "<?xml version='1.0\"?>", "<?xml version=\"1.0'?>",
  '<?xml version "1.0"?>', '<?xml version=="1.0"?>',
  '<?xml encoding="UTF-8" version="1.0"?>',
  '<?xml standalone="yes" version="1.0"?>',
  '<?xml version="1.0" standalone="yes" encoding="UTF-8"?>',
  '<?xmlversion="1.0"?>',
  '<?xml version="1.0"encoding="UTF-8"?>',
  '<?xml version="1.0"standalone="yes"?>',
  '<?xml version="1.0" encoding="UTF-8"standalone="no"?>',
  '<?xml version="1.0" encoding=""standalone="yes"?>',
  ...["\u00a0", "\u0085", "\u2028", "\ufeff"].flatMap(space => [
    `<?xml${space}version="1.0"?>`,
    `<?xml version="1.0"${space}encoding="UTF-8"?>`,
    `<?xml version="1.0" encoding="UTF-8"${space}standalone="yes"?>`,
    `<?xml version="1.0"${space}?>`,
  ]),
  ...["8UTF", "-UTF8", ".UTF8", "_UTF8", "UTF 8", "UTF/8", "UTF:8", "UTF+8", "UTFé", " UTF-8", "UTF-8 ", "UTF&#45;8"].map(value =>
    `<?xml version="1.0" encoding="${value}"?>`),
  ...["YES", "NO", "true", "false", " yes", "yes ", "y&#101;s"].map(value =>
    `<?xml version="1.0" standalone="${value}"?>`),
  '<?xml version="1.0" version="1.0"?>',
  '<?xml version="1.0" encoding="UTF-8" encoding="UTF-8"?>',
  '<?xml version="1.0" standalone="yes" standalone="no"?>',
  '<?xml version="1.0" encoding="" encoding="UTF-8"?>',
  '<?xml version="1.0" standalone="" standalone="yes"?>',
  '<?xml version="1.0" unknown="PRIVATE_DECLARATION_VALUE"?>',
  '<?xml version="1.0" Encoding="UTF-8"?>',
  '<?xml Version="1.0"?>',
  '<?xml version="1.0" encoding=UTF-8?>',
  '<?xml version="1.0" standalone=yes?>',
  '<?xml version="1.0" encoding="UTF-8\'?>',
  '<?xml version="1.0" standalone="yes\'?>',
  '<?xml version="1.0" encoding "UTF-8"?>',
  '<?xml version="1.0" standalone "yes"?>',
  '<?xml version="1.0"', '<?xml version="1.0">', '<?xml version="1.0"? >',
  '<?xml version="1.0"??>', '<?xml version="1.0"/>',
  '<?xml version="&#49;.0"?>',
];

// Grammatically valid declarations still subject to the unchanged policy.
export const declarationsOutsidePolicy = [
  '<?xml version="1.1"?>', '<?xml version="1.00"?>', '<?xml version="1.9"?>',
  ...["UTF-16", "UTF8", "UTF_8", "UTF.8", "ISO-8859-1", "X-custom"].map(value =>
    `<?xml version="1.0" encoding="${value}"?>`),
];

const declaration = '<?xml version="1.0"?>';
const lookalikes = [
  { id: "after-whitespace", xml: " " + declaration + document, expected: false },
  { id: "after-comment", xml: "<!--before-->" + declaration + document, expected: false },
  { id: "after-PI", xml: "<?p?>" + declaration + document, expected: false },
  { id: "after-root", xml: document + declaration, expected: false },
  { id: "inside-root", xml: '<gpx>' + declaration + '<wpt lat="0" lon="1"/></gpx>', expected: false },
  { id: "inside-ignored-content", xml: document.replace('</gpx>', '<extensions>' + declaration + '</extensions></gpx>'), expected: false },
  { id: "duplicate-declaration", xml: declaration + declaration + document, expected: false },
  ...["XML", "Xml", "xMl"].map(target => ({ id: "reserved-PI-target-" + target, xml: `<?${target} version="1.0"?>` + document, expected: false })),
  { id: "stylesheet-PI", xml: '<?xml-stylesheet type="text/xsl" href="unused.xsl"?>' + document, expected: true },
  { id: "stylesheet-after-root", xml: document + '<?xml-stylesheet?>', expected: true },
  { id: "other-xml-prefixed-PI", xml: '<?xmlmodel data?>' + document, expected: true },
  { id: "declaration-lookalike-comment", xml: '<!--<?xml version="1.0" encoding=""?>-->' + document, expected: true },
  { id: "declaration-lookalike-CDATA", xml: document.replace('/>', '><name><![CDATA[<?xml version="1.0" encoding=""?>]]></name></wpt>'), expected: true },
];

export const xmlDeclarationCases = [
  ...validDeclarations.map((value, index) => ({ id: "valid-" + index, xml: value + document, expected: true })),
  ...malformedDeclarations.map((value, index) => ({ id: "malformed-" + index, xml: value + document, expected: false })),
  ...declarationsOutsidePolicy.map((value, index) => ({ id: "outside-policy-" + index, xml: value + document, expected: false })),
  ...lookalikes,
].flatMap(item => [false, true].map(bom => ({ ...item, id: item.id + "/BOM=" + bom, xml: (bom ? "\ufeff" : "") + item.xml })));
