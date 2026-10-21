import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseHtml } from "parse5";
import { processGpxInput } from "../../src/gpx/process.js";
import { serializeGpx } from "../../src/gpx/serialize.js";
import { policy } from "../helpers/phase-a.js";
import { setupRetrieval } from "../helpers/retrieval.js";
import { expectedCanonical, gpxForm, invalidB5Inputs, richGpx } from "../helpers/phase-b5.js";

// From the Xylem checkout (both external checkouts need their installed dependencies):
// ANEMOCHORE_CHECKOUT=/path/to/anemochore TILIA_CHECKOUT=/path/to/Tilia npm run test:integration
function checkoutFile(variable: string, file: string): string {
  const input = process.env[variable];
  if (!input) throw new Error(`${variable} must explicitly name the external checkout`);
  const path = resolve(input, file);
  if (!existsSync(path)) throw new Error(`${variable} is missing required file: ${file}`);
  return path;
}
const anemochoreModule = pathToFileURL(checkoutFile("ANEMOCHORE_CHECKOUT", "src/app.js")).href;
const tiliaModule = pathToFileURL(checkoutFile("TILIA_CHECKOUT", "src/gpx/parse.js")).href;
const tiliaRequire = createRequire(checkoutFile("TILIA_CHECKOUT", "package.json"));
const { DOMParser } = tiliaRequire("@xmldom/xmldom");
const { createApp: createAnemochoreApp } = await import(/* @vite-ignore */ anemochoreModule);
const { parseGpxText } = await import(/* @vite-ignore */ tiliaModule);

describe("Phase B actual cross-repository contract", () => {
  let harness: Awaited<ReturnType<typeof setupRetrieval>>;
  let storage: ReturnType<typeof createAnemochoreApp>;
  let env: any;
  let entries: Map<string, string>;
  let writes: {key: string; options: unknown}[];
  beforeEach(async () => {
    harness = await setupRetrieval();
    vi.spyOn(console, "log").mockImplementation(() => {});
    entries = new Map(); writes = [];
    env = {
      ANEMOCHORE_API_KEYS: "PRIVATE_KEY",
      GPX_STORE: {
        async put(key: string, value: string, options: unknown) {
          entries.set(key, value); writes.push({key, options});
        },
        async get(key: string, type?: string) {
          const value = entries.get(key);
          return value === undefined ? null : type === "json" ? JSON.parse(value) : value;
        },
        async delete(key: string) { entries.delete(key); },
      },
      UPLOAD_RATE_LIMITER: {async limit() { return {success: true}; }},
      DELETE_RATE_LIMITER: {async limit() { return {success: true}; }},
    };
    storage = createAnemochoreApp();
    // Only replace the network transport. All application processing is real.
    harness.fetchMock.mockImplementation(async (url, init) => {
      const request = new Request(String(url), init);
      expect(new URL(request.url).origin).toBe("https://storage.example");
      return storage.fetch(request, env);
    });
  });
  afterEach(async () => { await harness?.cleanup(); });

  async function upload() {
    const response = await harness.app.request("/api/upload", {method: "POST", body: gpxForm(richGpx)});
    expect(response.status).toBe(200);
    return response.json();
  }

  it("preserves real input through preview, upload, KV, retrieval, safe HTML and deletion", async () => {
    const preview = await harness.app.request("/api/normalize", {method: "POST", body: gpxForm(richGpx)});
    expect(preview.status).toBe(200);
    const previewXml = await preview.text();
    expect(processGpxInput(previewXml, policy)).toEqual(expectedCanonical);
    expect(previewXml).toBe(serializeGpx(expectedCanonical, policy));
    expect(writes).toEqual([]);
    expect(harness.fetchMock).not.toHaveBeenCalled();

    const uploaded = await upload();
    expect(uploaded).not.toHaveProperty("delete_key");
    expect(writes).toEqual([{key: uploaded.id, options: {expirationTtl: 86400}}]);
    const stored = JSON.parse(entries.get(uploaded.id)!);
    expect(stored.content).toEqual(expectedCanonical);
    expect(stored.format).toBe("canonical-geodata");
    expect(stored.delete_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toHaveProperty("delete_key");

    // Anemochore retrieval is public and returns just the canonical content.
    const canonicalResponse = await storage.fetch(new Request(`https://storage.example/api/gpx/${uploaded.id}`), env);
    expect(canonicalResponse.status).toBe(200);
    expect(await canonicalResponse.json()).toEqual(expectedCanonical);
    const retrieved = await harness.app.request(`/api/gpx/${uploaded.id}`);
    expect(retrieved.status).toBe(200);
    expect(await retrieved.text()).toBe(previewXml);
    expect(processGpxInput(previewXml, policy)).toEqual(expectedCanonical);

    const shared = await harness.app.request(`/s/${uploaded.id}`);
    expect(shared.status).toBe(200);
    expect(shared.headers.get("content-type")).toContain("text/html");
    const html = await shared.text();
    const elements: any[] = [];
    const visit = (node: any) => { if (node.tagName) elements.push(node); for (const child of node.childNodes ?? []) visit(child); };
    visit(parseHtml(html));
    const title = elements.find(node => node.tagName === "title");
    expect(title.childNodes.map((node: any) => node.value ?? "").join("")).toBe(expectedCanonical.data.tracks[0].name + " - GPX Share (beta)");
    expect(elements.filter(node => node.tagName === "script")).toHaveLength(2);
    expect(elements.some(node => node.attrs?.some((attr: any) => attr.name.startsWith("on")))).toBe(false);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
    expect(JSON.stringify(harness.logs)).not.toContain("alert(1)");

    const deleted = await harness.app.request(`/api/gpx/${uploaded.id}`, {method: "DELETE", headers: {"X-Delete-Token": uploaded.deleteToken}});
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({deleted: true});
    expect(entries.has(uploaded.id)).toBe(false);
    expect((await storage.fetch(new Request(`https://storage.example/api/gpx/${uploaded.id}`), env)).status).toBe(404);
    // Shared HTML cache behavior is intentionally unchanged; check the GPX route.
    const missing = await harness.app.request(`/api/gpx/${uploaded.id}`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({error: "Not Found"});
  });

  it("is consumable by the actual Birch parser without claiming timestamp-string losslessness", async () => {
    await upload();
    const id = writes[0].key;
    const response = await harness.app.request(`/api/gpx/${id}`);
    expect(response.status).toBe(200);
    const parsed = parseGpxText(await response.text(), {
      createDomParser: ({onError}: any) => new DOMParser({errorHandler: {warning: onError, error: onError, fatalError: onError}}),
    });
    expect(parsed.routes).toHaveLength(2);
    for (const [index, route] of expectedCanonical.data.routes.entries()) {
      expect(parsed.routes[index]).toMatchObject({name: route.name, description: route.desc});
      expect(parsed.routes[index].points).toHaveLength(route.points.length);
      for (const [pointIndex, point] of route.points.entries()) {
        expect(parsed.routes[index].points[pointIndex]).toMatchObject({
          lon: point.coordinates[0], lat: point.coordinates[1], elevation: point.coordinates[2] ?? null,
          name: point.name, timestamp: Date.parse(point.time!),
          ...(point.desc ? {description: point.desc} : {}), ...(point.sym ? {symbol: point.sym} : {}),
        });
      }
    }
    expect(parsed.tracks[0].segments).toHaveLength(2);
    expect(parsed.waypoints[0]).toMatchObject({lat: -1, lon: 2, name: "目印"});
  });

  for (const endpoint of ["normalize", "upload"]) {
    it.each(invalidB5Inputs)(`${endpoint}: %s never writes KV`, async (_label, xml) => {
      const response = await harness.app.request(`/api/${endpoint}`, {method: "POST", body: gpxForm(xml)});
      expect(response.status).toBe(400);
      expect(writes).toEqual([]);
      expect(entries.size).toBe(0);
      expect(harness.fetchMock).not.toHaveBeenCalled();
    });
  }
  it.each(["/api/gpx/", "/s/"])("rejects invalid stored canonical content through %s with B4 classification", async route => {
    // Store through the actual Anemochore endpoint: it intentionally has no GPX semantic validator.
    const invalid = structuredClone(expectedCanonical);
    invalid.data.routes[1].points[0].coordinates[0] = 180;
    const response = await storage.fetch(new Request("https://storage.example/api/upload", {
      method: "POST", headers: {Authorization: "Bearer PRIVATE_KEY", "Content-Type": "application/json"}, body: JSON.stringify(invalid),
    }), env);
    expect(response.status).toBe(200);
    const {id} = await response.json();
    const rejected = await harness.app.request(route + id);
    expect(rejected.status).toBe(502);
    expect(await rejected.json()).toEqual({error: "Bad Gateway"});
    expect(harness.logs).toContainEqual(expect.objectContaining({failure_reason: "schema", result: "failure"}));
    expect(JSON.stringify(harness.logs)).not.toContain("alert(1)");
  });
});
