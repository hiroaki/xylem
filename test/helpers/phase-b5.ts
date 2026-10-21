import type { CanonicalGpxDocument } from "../../src/gpx/contract.js";
import { gpx } from "./phase-a.js";

// Expected values are specified independently of the input processing pipeline.
export const richGpx = gpx(`
  <rte><name> 空の道 😀 </name><desc>計画 &amp; 下見</desc></rte>
  <rte><name> 山道 </name><desc> 第一行\n第二行 &lt;安全&gt; </desc>
    <rtept lat="35" lon="139"><ele>0</ele><time>2026-10-19T12:34:56.123456+09:00</time>
      <name> 出発 😀 </name><desc> A &amp; B &lt;C&gt; "D" </desc><sym> Flag </sym></rtept>
    <rtept lat="35" lon="139"><name>二番目</name><time>2026-10-19T03:35:00.50Z</time></rtept>
    <rtept lat="35" lon="139"><name>三番目</name><desc>別の説明</desc><sym>Summit</sym><time>2026-10-19T04:00:00Z</time></rtept>
  </rte>
  <wpt lat="-1" lon="2"><name>目印</name><desc>unsupported</desc></wpt>
  <trk><name>道 &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; {{ID}}</name>
    <trkseg/><trkseg><trkpt lat="0.0000001" lon="-0.0000001"><ele>12.345</ele>
      <time>2026-10-19T00:00:00-03:30</time><name>unsupported</name></trkpt></trkseg>
    <trkseg><trkpt lat="36" lon="140"/></trkseg>
  </trk><trk><name>removed empty track</name><trkseg/></trk>`);

export const expectedCanonical: CanonicalGpxDocument = {
  schema_version: 1, data_type: "gpx", data: {
    tracks: [{name: '道 </title><script>alert(1)</script> & {{ID}}', segments: [
      {points: [{coordinates: [-0.0000001, 0.0000001, 12.345], time: "2026-10-19T00:00:00-03:30"}]},
      {points: [{coordinates: [140, 36]}]},
    ]}],
    routes: [
      {name: "空の道 😀", desc: "計画 & 下見", points: []},
      {name: "山道", desc: "第一行\n第二行 <安全>", points: [
        {coordinates: [139, 35, 0], time: "2026-10-19T12:34:56.123456+09:00", name: "出発 😀", desc: 'A & B <C> "D"', sym: "Flag"},
        {coordinates: [139, 35], name: "二番目", time: "2026-10-19T03:35:00.50Z"},
        {coordinates: [139, 35], name: "三番目", desc: "別の説明", sym: "Summit", time: "2026-10-19T04:00:00Z"},
      ]},
    ],
    waypoints: [{coordinates: [2, -1], name: "目印"}],
  },
};

export function gpxForm(xml: string): FormData {
  const form = new FormData();
  form.append("file", new File([xml], "route.gpx", {type: "application/gpx+xml"}));
  return form;
}

export const invalidB5Inputs = [
  ["empty route", gpx("<rte><name>empty</name></rte>")],
  ["multiple empty routes", gpx("<rte/><rte/>")],
  ["no geometry", gpx("<trk><trkseg/></trk>")],
  ["invalid coordinate among valid points", gpx('<rte/><wpt lat="0" lon="0"/><rte><rtept lat="NaN" lon="0"/></rte>')],
  ["empty routes exceed route budget", gpx('<rte/>'.repeat(21) + '<wpt lat="0" lon="0"/>')],
] as const;
