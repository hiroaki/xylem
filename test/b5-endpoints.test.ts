import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processGpxInput } from "../src/gpx/process.js";
import { policy, gpx } from "./helpers/phase-a.js";
import { setupRetrieval } from "./helpers/retrieval.js";
import { expectedCanonical, gpxForm, invalidB5Inputs, richGpx } from "./helpers/phase-b5.js";

describe("B5 actual input endpoints", () => {
  let harness: Awaited<ReturnType<typeof setupRetrieval>>;
  beforeEach(async () => {
    harness = await setupRetrieval();
    harness.fetchMock.mockImplementation(async () => new Response(JSON.stringify({id: "stored", delete_key: "test-key"})));
  });
  afterEach(async () => { await harness?.cleanup(); });

  it("normalizes and uploads the original rich input to independently expected canonical content", async () => {
    const preview = await harness.app.request("/api/normalize", {method: "POST", body: gpxForm(richGpx)});
    expect(preview.status).toBe(200);
    expect(processGpxInput(await preview.text(), policy)).toEqual(expectedCanonical);
    expect(harness.fetchMock).not.toHaveBeenCalled();
    const upload = await harness.app.request("/api/upload", {method: "POST", body: gpxForm(richGpx)});
    expect(upload.status).toBe(200);
    expect(harness.fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(harness.fetchMock.mock.calls[0][1]?.body))).toEqual(expectedCanonical);
  });
  for (const endpoint of ["normalize", "upload"]) {
    it(`${endpoint}: applies shared omission, truncation, namespace and singleton rules`, async () => {
      const xml = gpx(`<rte><desc>${"😀".repeat(4097)}</desc><desc>fallback</desc>
        <rtept lat="0" lon="0"><name><child/></name><name>fallback</name>
          <desc xmlns="urn:foreign">foreign</desc><desc> A &amp; B </desc>
          <sym>${"😀".repeat(129)}</sym><sym>fallback</sym>
          <time>0000-01-01T00:00:00Z</time><time>2026-01-01T00:00:00Z</time></rtept></rte>`);
      const response = await harness.app.request(`/api/${endpoint}`, {method: "POST", body: gpxForm(xml)});
      expect(response.status).toBe(200);
      const canonical = endpoint === "normalize" ? processGpxInput(await response.text(), policy)
        : JSON.parse(String(harness.fetchMock.mock.calls[0][1]?.body));
      expect(canonical.data.routes).toEqual([{desc: "😀".repeat(4095) + "…", points: [{coordinates: [0, 0], desc: "A & B"}]}]);
    });
    it.each(invalidB5Inputs)(`${endpoint}: rejects %s without calling storage`, async (_label, xml) => {
      const response = await harness.app.request(`/api/${endpoint}`, {method: "POST", body: gpxForm(xml)});
      expect(response.status).toBe(400);
      expect(harness.fetchMock).not.toHaveBeenCalled();
    });
    it(`${endpoint}: keeps the existing raw 2 MiB limit`, async () => {
      const response = await harness.app.request(`/api/${endpoint}`, {method: "POST", body: gpxForm(richGpx + " ".repeat(policy.maxRawBytes))});
      expect(response.status).toBe(400);
      expect(harness.fetchMock).not.toHaveBeenCalled();
    });
    it.each(['<wpt lat="0" lon="0"/>', '<trk><trkseg><trkpt lat="0" lon="0"/></trkseg></trk>', '<rte><rtept lat="0" lon="0"/></rte>'])(`${endpoint}: accepts empty routes alongside %s`, async geometry => {
      const response = await harness.app.request(`/api/${endpoint}`, {method: "POST", body: gpxForm(gpx(`<rte><name>empty</name></rte>${geometry}`))});
      expect(response.status).toBe(200);
      const canonical = endpoint === "normalize" ? processGpxInput(await response.text(), policy)
        : JSON.parse(String(harness.fetchMock.mock.calls[0][1]?.body));
      expect(canonical.data.routes[0]).toEqual({name: "empty", points: []});
    });
  }
});
