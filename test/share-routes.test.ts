import { parse } from "parse5";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupRetrieval, shareId, canonical } from "./helpers/retrieval.js";
// Only the write failure test injects I/O failure; all other operations use
// the real filesystem in a test-owned temporary directory.
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {...actual, writeFile: vi.fn(actual.writeFile)};
});
let ctx: Awaited<ReturnType<typeof setupRetrieval>>;
beforeEach(async () => {ctx = await setupRetrieval();});
afterEach(async () => ctx?.cleanup());
const get = (id = shareId) => ctx.app.request(`https://local/s/${id}`);
function nodes(document: any): any[] {return [document, ...(document.childNodes ?? []).flatMap(nodes)];}
function text(node: any): string {return node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");}
function attr(node: any, name: string) {return node.attrs?.find((a: any) => a.name === name)?.value;}
function structure(document: any) {
  return nodes(document).filter(n => n.tagName).map(n => ({tag: n.tagName, parent: n.parentNode?.tagName,
    attributes: (n.attrs ?? []).map((a: any) => a.name).sort()}));
}

it.each(["bad", "../x", shareId + "%0A", shareId.replace("4123", "3123"), "a%2Fb"])("rejects invalid share ID %s before retrieval", async id => {
  expect((await get(id)).status).toBe(404); expect(ctx.fetchMock).not.toHaveBeenCalled();
});
const hostile = ["$'", "$&", "$`", "$$", "{{ID}}", "{{OG_URL}}", '"\'&<>', "</script><img src=x onerror=alert(1)>", '日😀\nsecond line', "&quot;&#x3c;", "\tA\r\nB"];
it.each(hostile)("preserves DOM and literal metadata %j", async name => {
  const first = await get(); const baseline = parse(await first.text());
  await fs.rm(join(ctx.cache, shareId + ".html"));
  const d = canonical(); d.data.waypoints[0].name = name;
  ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  const response = await get(); expect(response.status).toBe(200);
  const html = await response.text(); const document = parse(html); const all = nodes(document);
  expect(structure(document)).toEqual(structure(baseline));
  const expected = `${name} - GPX Share (beta)`.replace(/\r\n?/g, "\n");
  expect(text(all.find(n => n.tagName === "title"))).toBe(expected);
  expect(attr(all.find(n => attr(n, "property") === "og:title"), "content")).toBe(expected);
  expect(all.filter(n => n.tagName === "script").map(text)).toEqual(nodes(baseline).filter(n => n.tagName === "script").map(text));
  expect(all.filter(n => n.tagName === "script")).toHaveLength(2);
  expect(attr(all.find(n => attr(n, "property") === "og:url"), "content")).toBe(`https://gpx.example/s/${shareId}`);
});
it("preserves existing metadata priority and summary rather than adding description display", async () => {
  const d: any = canonical(); d.data.tracks = [{name: "Track priority", segments: [{points: [{coordinates: [0,0]}]}]}];
  d.data.routes = [{name: "Route", desc: "Unused description", points: []}];
  ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  const r = await get(); const all = nodes(parse(await r.text()));
  expect(text(all.find(n => n.tagName === "title"))).toBe("Track priority - GPX Share (beta)");
  expect(attr(all.find(n => attr(n, "property") === "og:description"), "content")).toBe("Distance: 0 m");
});
it("escapes URL attributes and preserves the existing configured prefix without normalization", async () => {
  const publicBase = 'https://gpx.example/base/?a=1&b="quoted"';
  vi.stubEnv("XYLEM_PUBLIC_ORIGIN", publicBase);
  const r = await get(); const all = nodes(parse(await r.text()));
  expect(attr(all.find(n => attr(n, "property") === "og:url"), "content")).toBe(`${publicBase}/s/${shareId}`);
});
it.each(["javascript:alert(1)", "data:text/html,x", "file:///tmp/x", "ftp://example/x"])("rejects unsafe public scheme %s", async url => {
  const {getConfig} = await import("../src/config.js");
  for (const key of ["XYLEM_PUBLIC_ORIGIN", "CHLOROPLAST_PUBLIC_ORIGIN"]) {
    vi.stubEnv(key, url); expect(() => getConfig()).toThrow("HTTP(S)");
    expect((await get()).status).toBe(500); expect(await fs.readdir(ctx.cache)).toEqual([]);
    vi.stubEnv(key, "https://public.example");
  }
});
it.each(["http://localhost:8080/prefix/", "HTTPS://Example.com/path/?q=1"])("preserves accepted public URL %s", async value => {
  vi.stubEnv("XYLEM_PUBLIC_ORIGIN", value); vi.stubEnv("CHLOROPLAST_PUBLIC_ORIGIN", value);
  const {getConfig} = await import("../src/config.js");
  expect(getConfig().xylemPublicOrigin).toBe(value); expect(getConfig().chloroplastPublicOrigin).toBe(value);
});
it("reuses cache and invalidates only at the existing 24-hour boundary", async () => {
  const first = await get(); const html = await first.text();
  const path = join(ctx.cache, shareId + ".html"); const mtime = (await fs.stat(path)).mtimeMs;
  const now = vi.spyOn(Date, "now").mockReturnValue(mtime + 86400000 - 1);
  expect(await (await get()).text()).toBe(html); expect(ctx.fetchMock).toHaveBeenCalledOnce();
  now.mockReturnValue(mtime + 86400000);
  expect((await get()).status).toBe(200); expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
});
it("isolates cache by ID and preserves manual cache-clearing behavior", async () => {
  const secondId = "11234567-0123-4123-8123-0123456789ab";
  await get(); const d = canonical(); d.data.waypoints[0].name = "Second";
  ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  expect(await (await get(secondId)).text()).toContain("<title>Second -");
  expect(await fs.readdir(ctx.cache)).toHaveLength(2); expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
  await fs.rm(join(ctx.cache, shareId + ".html"));
  await get(); expect(ctx.fetchMock).toHaveBeenCalledTimes(3);
  await get(); expect(ctx.fetchMock).toHaveBeenCalledTimes(3);
});
it("coalesces successful generation and serves later hits without fetching", async () => {
  let release!: (r: Response) => void;
  ctx.fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => {release = resolve;}));
  const first = get(), second = get();
  await vi.waitFor(() => expect(ctx.fetchMock).toHaveBeenCalledOnce());
  release(new Response(JSON.stringify(canonical())));
  const responses = await Promise.all([first, second]);
  expect(responses.map(r => r.status)).toEqual([200,200]);
  expect(await responses[0].text()).toBe(await responses[1].text());
  await get(); expect(ctx.fetchMock).toHaveBeenCalledOnce();
  expect(ctx.logs.filter(e => e.event === "anemochore_gpx_fetched")).toHaveLength(1);
});
it.each([404,502])("does not cache failure %s; clears in-flight and permits retry", async status => {
  ctx.fetchMock.mockResolvedValueOnce(status === 404 ? new Response(null,{status:404}) : new Response("{bad"));
  expect((await get()).status).toBe(status); expect(await fs.readdir(ctx.cache)).toEqual([]);
  expect((await get()).status).toBe(200); expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
});
it("keeps HTML rendering failures internal, private and uncached", async () => {
  const d: any = canonical(); d.data.routes = [{points: [{coordinates: [0,0]}, {coordinates: [1,1]}]}];
  ctx.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(d)));
  vi.spyOn(Math, "sin").mockImplementationOnce(() => {throw new Error("PRIVATE_RENDER");});
  const r = await get(); expect(r.status).toBe(500); expect(await r.text()).not.toContain("PRIVATE");
  expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE"); expect(await fs.readdir(ctx.cache)).toEqual([]);
});
it("keeps cache read errors internal and private", async () => {
  await fs.rm(ctx.cache, {recursive:true}); await fs.writeFile(ctx.cache, "not a directory");
  const r = await get(); expect(r.status).toBe(500); expect(ctx.fetchMock).not.toHaveBeenCalled();
  expect(await r.json()).toEqual({error: "Internal Server Error"});
});
it("keeps cache write errors internal and private", async () => {
  vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error("PRIVATE_WRITE"));
  const r = await get(); expect(r.status).toBe(500); expect(await r.text()).not.toContain("PRIVATE");
  expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE"); expect(await fs.readdir(ctx.cache)).toEqual([]);
});

it("keeps UUID case acceptance and restricts script values to that exact ID", async () => {
  const uppercase = shareId.toUpperCase();
  const r = await get(uppercase); expect(r.status).toBe(200);
  const scripts = nodes(parse(await r.text())).filter(n => n.tagName === "script").map(text);
  expect(scripts[1]).toContain(`loadGpx("${uppercase}")`);
});
