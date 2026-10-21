import { readdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRetrieval, shareId, canonical } from "./helpers/retrieval.js";
let ctx: Awaited<ReturnType<typeof setupRetrieval>>;
beforeEach(async () => {ctx = await setupRetrieval();});
afterEach(async () => ctx?.cleanup());
describe.each(["/api/gpx/", "/s/"])("B4 retrieval %s", path => {
  it("maps malformed JSON to safe 502", async () => {
    ctx.fetchMock.mockResolvedValueOnce(new Response('{"PRIVATE_JSON":'));
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(502); expect(await r.text()).not.toContain("PRIVATE");
  });
  it("maps upstream errors without body/header passthrough", async () => {
    ctx.fetchMock.mockResolvedValueOnce(new Response("PRIVATE_BODY", {status: 503, headers: {"X-Private": "PRIVATE"}}));
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(502); expect(r.headers.get("X-Private")).toBeNull();
    expect(await r.text()).not.toContain("PRIVATE");
  });
});

// Every expected external rejection must be distinguished from internal bugs.
describe.each(["/api/gpx/", "/s/"])("B4 full boundary %s", path => {
  it("returns the existing output content type and uses unauthenticated manual redirects", async () => {
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe(path === "/s/" ? "text/html; charset=UTF-8" : "application/gpx+xml; charset=utf-8");
    const init = ctx.fetchMock.mock.calls[0][1]!;
    expect(init.redirect).toBe("manual"); expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(ctx.logs.filter(e => e.event === "response_sent")).toHaveLength(1);
  });
  it.each([404, 201, 204, 206, 301, 302, 307, 400, 401, 410, 429, 500, 503])("classifies upstream %s and cancels without reading", async status => {
    const cancel = vi.fn(() => Promise.reject(new Error("PRIVATE_CANCEL")));
    const body = new ReadableStream({cancel}, {highWaterMark: 0});
    // Native Response forbids a body for 204; its cleanup is trivially empty.
    ctx.fetchMock.mockResolvedValueOnce(new Response(status === 204 ? null : body, {status, headers: {"X-Private": "PRIVATE", Location: "https://PRIVATE"}}));
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(status === 404 ? 404 : 502);
    expect(r.headers.get("X-Private")).toBeNull(); expect(r.headers.get("Location")).toBeNull();
    expect(await r.text()).not.toContain("PRIVATE");
    if (status !== 204) expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
  it.each([new Error("PRIVATE_NETWORK"), new DOMException("PRIVATE_ABORT", "AbortError")])("maps unrelated network/abort to 502", async error => {
    ctx.fetchMock.mockRejectedValueOnce(error);
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(502); expect(await r.text()).not.toContain("PRIVATE");
    expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
  it.each([Uint8Array.of(0xff), Uint8Array.of(0xed, 0xa0, 0x80)])("rejects malformed UTF-8", async bytes => {
    ctx.fetchMock.mockResolvedValueOnce(new Response(bytes));
    expect((await ctx.app.request(`https://local${path}${shareId}`)).status).toBe(502);
    expect(ctx.logs.some(e => e.failure_reason === "utf8")).toBe(true);
  });
  it("rejects a body stream failure and releases its reader", async () => {
    const body = new ReadableStream({pull() {throw new Error("PRIVATE_STREAM");}});
    ctx.fetchMock.mockResolvedValueOnce(new Response(body));
    expect((await ctx.app.request(`https://local${path}${shareId}`)).status).toBe(502);
    expect(body.locked).toBe(false); expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
  const invalid = [
    (d: any) => {d.unknown = {private: "PRIVATE"};},
    (d: any) => {d.data.unknown = true;},
    (d: any) => {delete d.data.routes;},
    (d: any) => {d.schema_version = 2;},
    (d: any) => {d.data.waypoints[0].coordinates = [180, 0];},
    (d: any) => {d.data.waypoints[0].coordinates = [0, 91];},
    (d: any) => {d.data.waypoints[0].coordinates = [0, 0, 100000];},
    (d: any) => {d.data.waypoints[0].coordinates = ["0", 0];},
    (d: any) => {d.data.waypoints[0].name = "\ud800";},
    (d: any) => {d.data.waypoints[0].name = "\u0001";},
    (d: any) => {d.data.waypoints[0].name = " ";},
    (d: any) => {d.data.waypoints[0].name = "😀".repeat(257);},
    (d: any) => {d.data.waypoints[0].name = {private: "PRIVATE"};},
    (d: any) => {d.data.waypoints = [];},
    (d: any) => {d.data.tracks = [{segments: []}];},
    (d: any) => {d.data.routes = [{points: [{coordinates: [0,0], time: "0000-01-01T00:00:00Z"}]}];},
    (d: any) => {d.data.routes = [{desc: null, points: []}];},
    (d: any) => {d.data.routes = [{points: [{coordinates: [0,0], desc: "x".repeat(4097)}]}];},
    (d: any) => {d.data.routes = [{points: [{coordinates: [0,0], sym: "x".repeat(129)}]}];},
    (d: any) => {d.data.routes = [{points: [{coordinates: [0,0], constructor: "PRIVATE"}]}];},
    (d: any) => {d.data.routes = Array.from({length: 21}, () => ({points: []}));},
    (d: any) => {d.data.routes = [{points: Array.from({length: 101}, () => ({coordinates: [0,0]}))}];},
  ];
  it.each(invalid)("rejects complete canonical violations before output case %#", async mutate => {
    const d = canonical(); mutate(d);
    ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
    const serializer = vi.spyOn(await import("../src/gpx/serialize.js"), "serializeGpx");
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(502); expect(serializer).not.toHaveBeenCalled();
    expect(await readdir(ctx.cache)).toEqual([]); expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
  it.each(["null", "[]", "true", "1", '"PRIVATE"', '{"__proto__":{}}'])("rejects unexpected JSON shape %s", async body => {
    ctx.fetchMock.mockResolvedValueOnce(new Response(body));
    expect((await ctx.app.request(`https://local${path}${shareId}`)).status).toBe(502);
  });
  it("keeps a validator implementation failure internal and private", async () => {
    vi.spyOn(await import("../src/gpx/schema.js"), "assertValidCanonicalGpxDocument").mockImplementationOnce(() => {throw new Error("PRIVATE_VALIDATOR");});
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(500); expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
    expect(await r.json()).toEqual({error: "Internal Server Error"});
  });
  it("keeps an unexpected JSON implementation failure internal", async () => {
    vi.spyOn(JSON, "parse").mockImplementationOnce(() => {throw new Error("PRIVATE_PARSE_BUG");});
    const r = await ctx.app.request(`https://local${path}${shareId}`);
    expect(r.status).toBe(500); expect(await r.text()).not.toContain("PRIVATE");
    expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
});

it.each(["a%2Fb", "a%3Fb", "a%23b", "a%25b", "a%20b", "a%0Ab", "日本"])("rejects unsafe public ID %s before fetching", async id => {
  const r = await ctx.app.request(`https://local/api/gpx/${id}`);
  expect(r.status).toBe(404); expect(ctx.fetchMock).not.toHaveBeenCalled();
});
it("preserves short Anemochore-compatible IDs without requiring UUID", async () => {
  expect((await ctx.app.request("https://local/api/gpx/test-ID-1")).status).toBe(200);
  expect(ctx.fetchMock.mock.calls[0][0]).toBe("https://storage.example/api/gpx/test-ID-1");
});
it("does not reclassify a serializer failure after successful validation", async () => {
  const {CanonicalValidationError} = await import("../src/gpx/errors.js");
  vi.spyOn(await import("../src/gpx/serialize.js"), "serializeGpx").mockImplementationOnce(() => {throw new CanonicalValidationError("structure");});
  const r = await ctx.app.request(`https://local/api/gpx/${shareId}`);
  expect(r.status).toBe(500); expect(ctx.logs.some(e => e.failure_reason === "retrieval_internal")).toBe(true);
});

const fakeClock = () => vi.useFakeTimers({toFake: ["Date", "performance", "setTimeout", "clearTimeout"]});
async function fetchStarted() {
  for (let i = 0; i < 100 && ctx.fetchMock.mock.calls.length === 0; i++) await new Promise(resolve => setImmediate(resolve));
  expect(ctx.fetchMock).toHaveBeenCalledOnce();
}
describe.each(["/api/gpx/", "/s/"])("B4 one total deadline %s", path => {
  it("aborts at 10 seconds before headers, and cancels a late response", async () => {
    fakeClock(); let resolve!: (r: Response) => void;
    ctx.fetchMock.mockImplementationOnce(() => new Promise<Response>(r => {resolve = r;}));
    let finished = false;
    const pending = ctx.app.request(`https://local${path}${shareId}`).then(r => {finished = true; return r;});
    await fetchStarted();
    await vi.advanceTimersByTimeAsync(9999); expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await pending; expect(r.status).toBe(504);
    expect(ctx.fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    const cancel = vi.fn(); resolve(new Response(new ReadableStream({cancel})));
    await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["normal", "reject", "stall"])("uses remaining deadline after headers; cancellation=%s", async behavior => {
    fakeClock(); let resolve!: (r: Response) => void;
    ctx.fetchMock.mockImplementationOnce(() => new Promise<Response>(r => {resolve = r;}));
    const pending = ctx.app.request(`https://local${path}${shareId}`);
    await fetchStarted(); await vi.advanceTimersByTimeAsync(6000);
    const cancel = vi.fn(() => behavior === "reject" ? Promise.reject(new Error("PRIVATE_CANCEL")) : behavior === "stall" ? new Promise<void>(() => {}) : undefined);
    const body = new ReadableStream<Uint8Array>({start(c) {c.enqueue(new TextEncoder().encode('{"partial":'));}, cancel});
    resolve(new Response(body)); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3999); expect(ctx.fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(504); expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0); expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
  });
  it("accepts EOF just before deadline and clears the timer before derived output", async () => {
    fakeClock(); let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({start(c) {controller = c;}});
    ctx.fetchMock.mockResolvedValueOnce(new Response(body));
    const pending = ctx.app.request(`https://local${path}${shareId}`);
    await fetchStarted(); await vi.advanceTimersByTimeAsync(9999);
    controller.enqueue(new TextEncoder().encode(JSON.stringify(canonical()))); controller.close();
    expect((await pending).status).toBe(200); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(ctx.fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(body.locked).toBe(false);
  });
  it("rejects late EOF even if the timer callback has not run", async () => {
    const now = vi.spyOn(performance, "now"); const start = performance.now();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({start(c) {controller = c;}});
    ctx.fetchMock.mockResolvedValueOnce(new Response(body));
    const pending = ctx.app.request(`https://local${path}${shareId}`);
    await fetchStarted(); now.mockReturnValue(performance.now() + 10001);
    controller.enqueue(new TextEncoder().encode(JSON.stringify(canonical()))); controller.close();
    expect((await pending).status).toBe(504); expect(body.locked).toBe(false);
  });
});

it.each(["/api/gpx/", "/s/"])("cancels late headers when clock expiry precedes timer dispatch: %s", async path => {
  let resolve!: (response: Response) => void;
  ctx.fetchMock.mockImplementationOnce(() => new Promise<Response>(r => {resolve = r;}));
  const pending = ctx.app.request(`https://local${path}${shareId}`); await fetchStarted();
  const current = performance.now(); vi.spyOn(performance, "now").mockReturnValue(current + 10001);
  const cancel = vi.fn(); resolve(new Response(new ReadableStream({cancel})));
  expect((await pending).status).toBe(504); expect(cancel).toHaveBeenCalledOnce();
});

it.each(["/api/gpx/", "/s/"])("honors configured total-point policy on retrieval %s", async path => {
  await ctx.cleanup(); ctx = await setupRetrieval({env: {XYLEM_GPX_MAX_TOTAL_POINTS: "1"}});
  const d = canonical(); d.data.waypoints.push({coordinates: [0,0], name: "second"});
  ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  expect((await ctx.app.request(`https://local${path}${shareId}`)).status).toBe(502);
});

it.each(["/api/gpx/", "/s/"])("rejects deeper unknown branches without using them %s", async path => {
  const d: any = canonical(); let branch: any = {private: "PRIVATE"};
  for (let i = 0; i < 300; i++) branch = {next: branch};
  d.unknown = branch; ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  expect((await ctx.app.request(`https://local${path}${shareId}`)).status).toBe(502);
  expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
});

it.each(["/api/gpx/", "/s/"])("rejects a 10,000-level unknown property before canonical serialization %s", async path => {
  const json = await import("../src/gpx/json.js");
  const {MAX_CANONICAL_JSON_BYTES} = json;
  const encode = vi.spyOn(json, "encodeCanonicalJson");
  // Generate the nested JSON text directly: serializing its parsed object would
  // overflow the JS stack before this fixture could reach the HTTP boundary.
  const shallow = JSON.stringify(canonical());
  const wire = shallow.slice(0, -1) + ',"unknown":' + '{"next":'.repeat(10_000)
    + '"PRIVATE_DEEP_INPUT"' + '}'.repeat(10_000) + '}';
  expect(Buffer.byteLength(wire, "utf8")).toBeLessThan(MAX_CANONICAL_JSON_BYTES);
  expect(() => JSON.parse(wire)).not.toThrow();
  ctx.fetchMock.mockResolvedValueOnce(new Response(wire));
  const serializer = vi.spyOn(await import("../src/gpx/serialize.js"), "serializeGpx");
  const escape = vi.spyOn(String.prototype, "replaceAll");
  const r = await ctx.app.request(`https://local${path}${shareId}`);
  expect(r.status).toBe(502);
  expect(await r.json()).toEqual({error: "Bad Gateway"});
  expect(serializer).not.toHaveBeenCalled();
  expect(encode).not.toHaveBeenCalled();
  expect(escape.mock.contexts.some(value => String(value) === "Sample - GPX Share (beta)")).toBe(false);
  expect(await readdir(ctx.cache)).toEqual([]);
  expect(ctx.logs.filter(e => e.event === "anemochore_gpx_fetched" && e.result === "failure"))
    .toEqual([expect.objectContaining({status: 502, failure_reason: "schema"})]);
  const logs = JSON.stringify(ctx.logs);
  for (const privateValue of ["PRIVATE_DEEP_INPUT", "RangeError", "Maximum call stack", "retrieval_internal", wire]) {
    expect(logs).not.toContain(privateValue);
  }
});

it.each(["/api/gpx/", "/s/"])("keeps unexpected post-validation serialization RangeError internal %s", async path => {
  vi.spyOn(await import("../src/gpx/json.js"), "encodeCanonicalJson").mockImplementationOnce(() => {
    throw new RangeError("PRIVATE_SERIALIZATION_BUG");
  });
  const r = await ctx.app.request(`https://local${path}${shareId}`);
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({error: "Internal Server Error"});
  expect(ctx.logs.some(e => e.failure_reason === "retrieval_internal")).toBe(true);
  expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE_SERIALIZATION_BUG");
  expect(await readdir(ctx.cache)).toEqual([]);
});
