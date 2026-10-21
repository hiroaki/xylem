// Fixed XML-boundary regression corpus, promoted from the reviewed feasibility study.
const GPX = "http://www.topografix.com/GPX/1/1";
const g = (body: string, attrs = '') => `<gpx xmlns="${GPX}" ${attrs}>${body}</gpx>`;
const good = '<wpt lat="0" lon="1"/>';
export const cases: { id: string; group: string; xml: string; expected: boolean; inspect?: string }[] = [];
const add = (id: string, group: string, xml: string, expected: boolean, inspect?: string) => cases.push({ id, group, xml, expected, inspect });
for (const hex of [false, true]) for (const zeros of [0, 28, 29, 30, 32, 40, 10000]) {
  const ref = `&#${hex ? 'x' : ''}${'0'.repeat(zeros)}${hex ? '31' : '49'};`, uri = GPX.slice(0, -1) + ref, prefix = `${hex ? 'hex' : 'dec'}-${zeros}`;
  add(prefix + '-root', 'F01', `<gpx xmlns="${uri}">${good}</gpx>`, true, 'point');
  add(prefix + '-hidden', 'F01', g(good + '<extensions><p:wpt lat="bad" lon="0"/></extensions>', `xmlns:p="${uri}"`), false);
  add(prefix + '-routes', 'F01', g(good + '<p:rte/>'.repeat(21), `xmlns:p="${uri}"`), false);
  add(prefix + '-coordinate', 'F01', g(`<wpt lat="${ref}" lon="1"/>`), true, 'one');
  add(prefix + '-elevation', 'F01', g(`<wpt lat="0" lon="1"><ele>${ref}</ele></wpt>`), true, 'elevation');
}
for (const [id, xml] of Object.entries({
  unexpected: '<gpx><wpt lat="0" lon="1"/></notopened/></gpx>',
  malformed: '<gpx><wpt lat="0" lon="1"/></x a="1"/></gpx>',
  mismatch: '<gpx><wpt lat="0" lon="1"/><x></y></gpx>',
})) add(id, 'F02', xml, false);
for (const whitespace of ['\u00a0', '\u2028', '\ufeff', '\u0085']) {
  add('attribute-space-' + whitespace.codePointAt(0), 'F03', `<gpx><wpt lat="0"${whitespace}lon="1"/></gpx>`, false);
  add('end-space-' + whitespace.codePointAt(0), 'F03', g(good + `<x></x${whitespace}>`), false);
}
add('trailing-reference', 'F03', g(good) + '&#32;', false);
add('leading-reference', 'F03', '&#32;' + g(good), false);
add('normalized-attributes', 'F04', g(good + '<extensions a="a\tb\nc\rd" b="a&#9;b&#10;c&#13;d"/>'), true, 'point');
add('duplicate-expanded', 'F04', g(good + '<x xmlns:p="urn:one" xmlns:q="urn:on&#101;" p:a="1" q:a="2"/>'), false);
add('duplicate-normalized-expanded', 'F04', g(good + '<x xmlns:p="urn:a\tb" xmlns:q="urn:a b" p:a="1" q:a="2"/>'), false);
add('valid-pi', 'F05', g('<wpt lat="0" lon="1"><name>A<?pi "?>B</name></wpt>'), true, 'pi');
for (const name of ['constructor', 'prototype', '__proto__', 'hasOwnProperty', '\u{10000}', '\u{effff}']) add('name-' + name, 'F05', g(good + `<extensions><${name}/></extensions>`), true, 'point');
add('utf8-declaration', 'F06', '<?xml version="1.0" encoding="UTF-8"?>' + g(good), true, 'point');
add('lowercase-utf8', 'F06', '<?xml version="1.0" encoding="utf-8"?>' + g(good), true, 'point');
for (const encoding of ['UTF-16', 'ISO-8859-1', 'UTF8', 'BOGUS']) add('encoding-' + encoding, 'F06', `<?xml version="1.0" encoding="${encoding}"?>` + g(good), false);
for (const version of ['1.1', '1.00', '1.9']) add('version-' + version, 'format', `<?xml version="${version}"?>` + g(good), false);
add('malformed-declaration', 'syntax', '<?xml version="1.0" encoding="UTF-8" junk="x"?>' + g(good), false);
add('duplicate-declaration', 'syntax', '<?xml version="1.0" version="1.0"?>' + g(good), false);
add('late-declaration', 'syntax', g(good) + '<?xml version="1.0"?>', false);
add('prefixed', 'namespace', `<p:gpx xmlns:p="${GPX}"><p:wpt lat="0" lon="1"/></p:gpx>`, true, 'point');
add('namespace-free', 'namespace', '<gpx><wpt lat="0" lon="1"/></gpx>', true, 'point');
add('namespace-order', 'namespace', g(`<p:wpt lat="0" lon="1" xmlns:p="${GPX}"/>`), true, 'point');
add('rebind-restore', 'namespace', g(`<p:rte xmlns:p="${GPX}"><p:rtept lat="0" lon="1"/></p:rte><p:wpt lat="bad" lon="0"/>`, 'xmlns:p="urn:foreign"'), true, 'route');
for (const [name, xml] of Object.entries({
  unbound: g(good + '<p:x/>'),
  xml_alias: g(good + '<x xmlns:p="http://www.w3.org/XML/1998/namespace"/>'),
  xmlns_alias: g(good + '<x xmlns:p="http://www.w3.org/2000/xmlns/"/>'),
  xml_rebind: g(good + '<x xmlns:xml="urn:wrong"/>'),
  prefix_undeclare: g(good + '<x xmlns:p=""/>'),
  multi_colon: g(good + '<p:a:b xmlns:p="urn:foreign"/>'),
})) add(name, 'namespace', xml, false);
add('foreign-geography', 'namespace', g(good + '<p:wpt xmlns:p="urn:foreign" lat="bad" lon="0"/>'), true, 'point');
add('single-pass', 'entities', g('<wpt lat="0" lon="1"><name>&amp;#49; &#38;#49; &amp;unknown;</name></wpt>'), true, 'single-pass');
add('cdata', 'entities', g('<wpt lat="0" lon="1"><name>A<![CDATA[&#0; &unknown;]]>B<!-- ignored -->C</name></wpt>'), true, 'cdata');
for (const value of ['&unknown;', '&nbsp;', '&#0;', '&#xD800;', '&#xFFFF;', '&#x110000;', '&#99999999999999999999999999;', '&#;', '&#x;', '&#X31;', '&#49']) add('illegal-' + value, 'security', g(good + `<extensions>${value}</extensions>`), false);
for (const declaration of ['<!DOCTYPE gpx>', '<!DOCTYPE gpx [<!ENTITY x "1">]>', '<!DOCTYPE gpx SYSTEM "https://invalid.example/">', '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>']) add(declaration, 'security', declaration + g(good), false);
add('lookalike', 'security', g(good + '<extensions><![CDATA[<!DOCTYPE gpx>]]></extensions>'), false);
add('illegal-raw', 'security', g(good + '<extensions>\u0001</extensions>'), false);
add('max-unicode', 'unicode', g('<wpt lat="0" lon="1"><name>A&#x10FFFF;B</name></wpt>'), true, 'max-unicode');
add('misplaced', 'GPX', g(good + '<extensions><wpt lat="bad" lon="0"/></extensions>'), false);
add('routepoint-limit', 'GPX', g('<rte>' + '<rtept lat="0" lon="1"/>'.repeat(101) + '</rte>'), false);
add('point-limit-equality', 'GPX', g('<rte>' + '<rtept lat="0" lon="1"/>'.repeat(100) + '</rte>'), true, '100-points');
add('invalid-coordinate', 'GPX', g(good + '<wpt lat="1e1" lon="0"/>'), false);
add('invalid-elevation', 'GPX', g('<wpt lat="0" lon="1"><ele>1e3</ele></wpt>'), true, 'point');
add('zero-elevation', 'GPX', g('<wpt lat="0" lon="1"><ele>&#48;</ele></wpt>'), true, 'zero-elevation');
add('first-singleton', 'GPX', g('<wpt lat="0" lon="1"><ele><x/></ele><ele>1</ele><name/><name>later</name></wpt>'), true, 'point');

export const bytes = [
  { id: 'UTF8-BOM', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(g(good))]), expected: true },
  { id: 'UTF8-BOM-declaration', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<?xml version="1.0" encoding="UTF-8"?>' + g(good))]), expected: true },
  { id: 'double-BOM', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from(g(good))]), expected: false },
  { id: 'double-BOM-XML11', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from('<?xml version="1.1"?>' + g(good))]), expected: false },
  { id: 'invalid-FF', bytes: Buffer.concat([Buffer.from(g('<wpt lat="0" lon="1"><name>A@B</name></wpt>').split('@')[0]), Buffer.from([0xff]), Buffer.from(g('<wpt lat="0" lon="1"><name>A@B</name></wpt>').split('@')[1])]), expected: false },
  { id: 'overlong-utf8', bytes: Buffer.concat([Buffer.from('<gpx>'), Buffer.from([0xc0, 0xaf]), Buffer.from(good + '</gpx>')]), expected: false },
  { id: 'truncated-utf8', bytes: Buffer.concat([Buffer.from(g(good)), Buffer.from([0xe3, 0x81])]), expected: false },
  { id: 'surrogate-utf8', bytes: Buffer.concat([Buffer.from('<gpx>'), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from(good + '</gpx>')]), expected: false },
  { id: 'UTF16LE', bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(g(good), 'utf16le')]), expected: false },
  { id: 'valid-UFFFD', bytes: Buffer.from(g('<wpt lat="0" lon="1"><name>A�B</name></wpt>')), expected: true },
];

export const point = '<wpt lat="0" lon="1"/>';
export const wrap = (body: string) => `<gpx>${point}<extensions>${body}</extensions></gpx>`;
export const attributes = (count: number, namespace = false) => Array.from({ length: count }, (_, i) => namespace ? ` xmlns:p${i}="urn:${i}"` : ` a${i}=""`).join('');
export const complexityCases = [
  { id: 'depth-256', xml: wrap('<x>'.repeat(254) + '</x>'.repeat(254)), expected: true },
  { id: 'depth-257', xml: wrap('<x>'.repeat(255) + '</x>'.repeat(255)), expected: false },
  { id: 'elements-200000', xml: wrap('<x/>'.repeat(199997)), expected: true },
  { id: 'elements-200001', xml: wrap('<x/>'.repeat(199998)), expected: false },
  ...[false, true].flatMap(ns => [256, 257].map(n => ({ id: `attributes-${ns}-${n}`, xml: wrap('<x' + attributes(n, ns) + '/>'), expected: n === 256 }))),
  { id: 'malformed-at-depth', xml: wrap('<x>'.repeat(254) + '</y>' + '</x>'.repeat(253)), expected: false },
  { id: 'malformed-at-elements', xml: wrap('<x/>'.repeat(199996) + '<x></y>'), expected: false },
  { id: 'malformed-at-attributes', xml: wrap('<x' + attributes(256) + '></y>'), expected: false },
  { id: 'lexical-sections', xml: wrap(`<x a="&lt;x a='='/>"/><!-- <x a='='/> --><?p <x a='='/>?><![CDATA[<x a='='/>]]>`), expected: true },
  ...['<!---->', '<?p?>', '<![CDATA[x]]>'].map(section => ({ id: 'many-' + section, xml: wrap(section.repeat(10000)), expected: true })),
];

// Character references retain XML whitespace; only literal attribute whitespace
// is normalized to spaces before namespace expanded-name comparison.
for (const [literal, reference] of [["\t", "&#9;"], ["\n", "&#10;"], ["\r", "&#13;"]]) {
  cases.push({ id: 'literal-normalization-' + reference, group: 'F04', xml: wrap(`<x xmlns:p="urn:a${literal}b" xmlns:q="urn:a b" p:a="1" q:a="2"/>`), expected: false });
  cases.push({ id: 'reference-preservation-' + reference, group: 'F04', xml: wrap(`<x xmlns:p="urn:a${reference}b" xmlns:q="urn:a b" p:a="1" q:a="2"/>`), expected: true, inspect: 'point' });
}
for (const hex of [false, true]) {
  const uri = GPX.slice(0, -1) + `&#${hex ? 'x' : ''}${'0'.repeat(40)}${hex ? '31' : '49'};`;
  for (const kind of ['rtept', 'trkpt']) cases.push({ id: `long-hidden-${kind}-${hex}`, group: 'F01', xml: g(good + `<extensions><p:${kind} lat="bad" lon="0"/></extensions>`, `xmlns:p="${uri}"`), expected: false });
  cases.push({ id: `long-routepoint-limit-${hex}`, group: 'F01', xml: g('<rte>' + '<p:rtept lat="0" lon="1"/>'.repeat(101) + '</rte>', `xmlns:p="${uri}"`), expected: false });
}
const utf16 = Buffer.from(g(good), 'utf16le');
bytes.push({ id: 'UTF16LE-no-BOM', bytes: utf16, expected: false });
bytes.push({ id: 'UTF16BE', bytes: Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(utf16).swap16()]), expected: false });
bytes.push({ id: 'out-of-range-UTF8', bytes: Buffer.concat([Buffer.from(g(good)), Buffer.from([0xf4,0x90,0x80,0x80])]), expected: false });

for (const namespace of [false, true]) complexityCases.push({
  id: `unterminated-attribute-overflow-${namespace}`,
  xml: '<gpx>' + point + '<extensions><x' + attributes(257, namespace),
  expected: false,
});
for (const uri of [` ${GPX} `, GPX.slice(0, -1) + '%31']) cases.push({
  id: 'namespace-URI-not-rewritten-' + uri,
  group: 'namespace', xml: `<gpx xmlns="${uri}">${point}</gpx>`, expected: false,
});
