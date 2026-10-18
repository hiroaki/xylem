import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeGpx } from "../src/gpx/serialize.js";
import { cases, bytes, complexityCases, point, wrap } from "./helpers/xml-migration.js";
import { confirmedMalformedDeclarations, xmlDeclarationCases } from "./helpers/xml-declarations.js";

let app: Hono;
let logs: unknown[];
beforeEach(async () => {
  vi.resetModules();
  for (const [name, value] of Object.entries({
    ANEMOCHORE_API_URL: "https://storage.example", ANEMOCHORE_API_KEY: "test",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example", XYLEM_DELETE_SECRET: "test",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example", LOG_LEVEL: "info",
    GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "test-id", delete_key: "test-key" }), { status: 200 })));
  logs = [];
  const record = (...args: unknown[]) => { logs.push(args); };
  const { setRootLoggerForTesting } = await import("../src/logging/root-logger.js");
  setRootLoggerForTesting({ info: record, warn: record, error: record, debug: record });
  app = (await import("../src/app.js")).createApp();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function request(path: string, input: string | Uint8Array) {
  const form = new FormData();
  form.append("file", new File([typeof input === "string" ? input : new Uint8Array(input)], "input.gpx"));
  return app.request("http://localhost/api/" + path, { method: "POST", body: form });
}
async function parity(input: string | Uint8Array, expected: boolean) {
  const preview = await request("normalize", input);
  expect(fetch).not.toHaveBeenCalled();
  const upload = await request("upload", input);
  expect(preview.status).toBe(expected ? 200 : 400);
  expect(upload.status).toBe(preview.status);
  if (!expected) {
    expect(fetch).not.toHaveBeenCalled();
    expect(await preview.json()).toEqual(await upload.json());
    return;
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  const stored = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
  expect(await preview.text()).toBe(serializeGpx(stored));
  return stored;
}
describe("production normalize/upload XML and byte boundary", () => {
  it.each(xmlDeclarationCases)("XML declaration $id", async item => { await parity(item.xml, item.expected); });
  it.each(confirmedMalformedDeclarations)("malformed declaration stays private: %s", async declaration => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateName = "PRIVATE_DECLARATION_GPX_NAME";
    for (const path of ["normalize", "upload"]) {
      const response = await request(path, declaration + `<gpx><wpt lat="0" lon="1"><name>${privateName}</name></wpt></gpx>`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid GPX file" });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(declaration);
    expect(JSON.stringify(logs)).not.toContain(privateName);
    expect(JSON.stringify(logs)).not.toContain("excerpt");
  });
  it.each([...cases, ...complexityCases])("$id", async item => { await parity(item.xml, item.expected); });
  it.each(bytes)("$id", async item => {
    const stored = await parity(item.bytes, item.expected);
    if (item.id === "valid-UFFFD") expect(stored.data.waypoints[0].name).toBe("A�B");
  });
  it.each([false, true])("actual 2 MiB bytes with optional BOM %s", async bom => {
    const template = (bom ? "\ufeff" : "") + wrap("@");
    const exact = template.replace("@", "日".repeat(Math.floor((2097152 - Buffer.byteLength(template) + 1) / 3)));
    const input = exact + " ".repeat(2097152 - Buffer.byteLength(exact));
    expect(Buffer.byteLength(input)).toBe(2097152);
    await parity(input, true);
    vi.mocked(fetch).mockClear();
    await parity(input + " ", false);
  });
  it.each(["namespace", "coordinate", "elevation"].flatMap(field => [false, true].map(hex => ({ field, hex }))))("near-2 MiB numeric reference $field / hex=$hex", async ({ field, hex }) => {
    const ref = (hex ? "&#x" : "&#") + "0".repeat(2096900) + (hex ? "31;" : "49;");
    const xml = field === "namespace" ? `<gpx xmlns="http://www.topografix.com/GPX/1/${ref}">${point}</gpx>`
      : field === "coordinate" ? `<gpx><wpt lat="${ref}" lon="1"/></gpx>`
        : `<gpx><wpt lat="0" lon="1"><ele>${ref}</ele></wpt></gpx>`;
    const stored = await parity(xml, true);
    expect(stored.data.waypoints[0].coordinates).toEqual(field === "coordinate" ? [1, 1] : field === "elevation" ? [1, 0, 1] : [1, 0]);
  });
  it("50000 waypoints preserve zero elevation at both endpoints", async () => {
    const stored = await parity('<gpx>' + '<wpt lat="0" lon="1"><ele>0</ele></wpt>'.repeat(50000) + '</gpx>', true);
    expect(stored.data.waypoints).toHaveLength(50000);
    expect(stored.data.waypoints.at(-1).coordinates).toEqual([1, 0, 0]);
  });
  it("parser excerpts never reach HTTP, console, or audit logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const privateText = "PRIVATE_XML_COORDINATES_139.12345";
    for (const path of ["normalize", "upload"]) {
      const response = await request(path, `<gpx>${point}<extensions>${privateText}&broken;</extensions></gpx>`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid GPX file" });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(privateText);
    expect(JSON.stringify(logs)).not.toContain("excerpt");
  });
  it("internal failures stay 500 and private exception messages stay out of logs", async () => {
    const privateText = "PRIVATE_INTERNAL_GPX_FRAGMENT";
    const module = await import("../src/gpx/canonicalize.js");
    vi.spyOn(module, "canonicalizeGpx").mockImplementation(() => { throw new TypeError(privateText); });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["normalize", "upload"]) {
      const response = await request(path, `<gpx>${point}</gpx>`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Internal Server Error" });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(2);
    for (const call of consoleError.mock.calls) {
      expect(String(call[1])).toContain("GPX processing failed");
      expect(String(call[1])).not.toContain(privateText);
    }
    expect(JSON.stringify(logs)).not.toContain(privateText);
  });
});
