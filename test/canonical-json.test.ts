import { describe, it, expect, vi } from "vitest";
import { encodeCanonicalJson, readCanonicalJson, MAX_CANONICAL_JSON_BYTES as cap, CanonicalJsonLimitError } from "../src/gpx/json.js";
import { prepareCanonicalGpx } from "../src/gpx/process.js";
import { assertValidCanonicalGpxDocument } from "../src/gpx/schema.js";
import { canonicalBytes } from "./helpers/canonical-bytes.js";
import { canonicalFixture } from "./helpers/phase-b.js";
import { policy } from "./helpers/phase-a.js";

function response(chunks: Uint8Array[], cancel = vi.fn()) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (index < chunks.length) c.enqueue(chunks[index++]); else c.close(); }, cancel,
  }, {highWaterMark: 0});
  return {body, cancel, response: new Response(body)};
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe("canonical JSON byte boundaries", () => {
  it("accepts exactly 10 MiB through B1, common preparation and retrieval", async () => {
    const d = canonicalBytes(cap);
    expect(() => assertValidCanonicalGpxDocument(d, policy)).not.toThrow();
    const prepared = prepareCanonicalGpx(d, policy);
    expect(Buffer.byteLength(prepared.json)).toBe(cap);
    expect(prepared.xml).toContain("<time>");
    const r = response([bytes(prepared.json.slice(0, 100)), bytes(prepared.json.slice(100))]);
    expect(await readCanonicalJson(r.response)).toEqual(d);
    expect(r.body.locked).toBe(false); expect(r.cancel).not.toHaveBeenCalled();
  });
  it("rejects +1 as an input budget failure, preserving invariant classification", () => {
    expect(() => prepareCanonicalGpx(canonicalBytes(cap + 1), policy)).toThrow("canonical JSON too large");
    expect(() => prepareCanonicalGpx({}, policy)).toThrow("invalid canonical GPX document");
  });
  it("counts UTF-8 and JSON escaping without mutation", async () => {
    const d = canonicalFixture(); d.data.tracks[0].name = '日本😀\r"\\';
    const before = structuredClone(d); const json = encodeCanonicalJson(d);
    expect(Buffer.byteLength(json)).toBeGreaterThan(json.length);
    expect(d).toEqual(before);
    const escaped = '  ' + json.replace("日", "\\u65e5") + "\n";
    expect(await readCanonicalJson(new Response(escaped, {headers: {"Content-Length": "999999999"}}))).toEqual(d);
  });
  it("measures multibyte and escaped metadata at the exact canonical boundary", () => {
    const d = canonicalBytes(cap);
    d.data.tracks[0].name = '日本😀\r"\\';
    const extra = Buffer.byteLength(JSON.stringify(d)) - cap;
    const point = d.data.tracks[0].segments[0].points[0];
    point.time = point.time!.slice(0, -extra - 1) + "Z";
    assertValidCanonicalGpxDocument(d, policy);
    expect(Buffer.byteLength(encodeCanonicalJson(d))).toBe(cap);
    point.time = point.time!.slice(0, -1) + "1Z";
    expect(() => encodeCanonicalJson(d)).toThrow(CanonicalJsonLimitError);
  });
  it("does not wait for a stalled cancel before rejecting and unlocking", async () => {
    const r = response([new Uint8Array(cap + 1)], vi.fn(() => new Promise<void>(() => {})));
    await expect(readCanonicalJson(r.response)).rejects.toBeInstanceOf(CanonicalJsonLimitError);
    expect(r.body.locked).toBe(false);
  });
  it("rejects post-parse numeric growth despite an in-limit wire body", async () => {
    const wire = JSON.stringify(canonicalBytes(cap + 1)).replace("0.000001", "1e-6");
    expect(Buffer.byteLength(wire)).toBeLessThan(cap);
    const content = await readCanonicalJson(new Response(wire));
    assertValidCanonicalGpxDocument(content, policy);
    expect(() => encodeCanonicalJson(content)).toThrow(CanonicalJsonLimitError);
  });
  it.each([false, true])("rejects overflow before JSON.parse, cancels and unlocks; cancellation rejects=%s", async (fail) => {
    const cancel = vi.fn(() => {if (fail) return Promise.reject(new Error("PRIVATE_CANCEL"));});
    const r = response([new Uint8Array(cap), new Uint8Array(1)], cancel);
    const parse = vi.spyOn(JSON, "parse");
    try {
      await expect(readCanonicalJson(r.response)).rejects.toBeInstanceOf(CanonicalJsonLimitError);
      expect(parse).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1); expect(r.body.locked).toBe(false);
    } finally { parse.mockRestore(); }
  });
  it("rejects one huge chunk and stops reading", async () => {
    const r = response([new Uint8Array(cap + 1), bytes("PRIVATE_DATA")]);
    await expect(readCanonicalJson(r.response)).rejects.toThrow("canonical JSON too large");
    expect(r.cancel).toHaveBeenCalledOnce(); expect(r.body.locked).toBe(false);
  });
  it("decodes split UTF-8 after full completion", async () => {
    const b = bytes('{"name":"日😀"}');
    const r = response(Array.from(b, byte => Uint8Array.of(byte)));
    expect(await readCanonicalJson(r.response)).toEqual({name: "日😀"});
    expect(r.body.locked).toBe(false); expect(r.cancel).not.toHaveBeenCalled();
  });
  it.each(['{"PRIVATE_JSON":', '"\ud800', '']) ("hides malformed input %j", async (input) => {
    await expect(readCanonicalJson(new Response(input))).rejects.toThrow(/^invalid canonical JSON response$/);
  });
  it("hides body stream and invalid UTF-8 errors", async () => {
    const body = new ReadableStream({pull() {throw new Error("PRIVATE_STREAM");}});
    await expect(readCanonicalJson(new Response(body))).rejects.toThrow(/^invalid canonical JSON response$/);
    await expect(readCanonicalJson(new Response(Uint8Array.of(0xff)))).rejects.toThrow(/^invalid canonical JSON response$/);
    expect(body.locked).toBe(false);
  });
});

it("removes abort listeners and unlocks the reader when an in-flight read is aborted", async () => {
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener");
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const body = new ReadableStream<Uint8Array>({cancel});
  const pending = readCanonicalJson(new Response(body), {signal: controller.signal});
  controller.abort(new Error("PRIVATE_ABORT_REASON"));
  await expect(pending).rejects.toThrow(/^invalid canonical JSON response$/);
  expect(body.locked).toBe(false); expect(cancel).toHaveBeenCalledOnce();
  expect(add).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  vi.restoreAllMocks();
});
it("marks body completion before parsing and removes the normal-path abort listener", async () => {
  const controller = new AbortController(); const remove = vi.spyOn(controller.signal, "removeEventListener");
  const stages: string[] = [];
  const parse = JSON.parse; vi.spyOn(JSON, "parse").mockImplementation(s => {stages.push("parse");return parse(s);});
  await readCanonicalJson(new Response("{}"), {signal: controller.signal, onBodyComplete: () => {stages.push("eof");}});
  expect(stages).toEqual(["eof", "parse"]); expect(remove).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
