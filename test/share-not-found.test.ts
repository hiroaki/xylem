import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setupRetrieval, shareId } from "./helpers/retrieval.js";

let ctx: Awaited<ReturnType<typeof setupRetrieval>>;
let publicDir: string;
const assetHtml = '<!doctype html><html lang="en"><head><title>GPX data not found</title></head><body><main><h1>GPX data not found</h1><a href="/">Back to home</a></main></body></html>';
beforeEach(async () => {
  publicDir = await mkdtemp(join(tmpdir(), "xylem-404-public-"));
  await writeFile(join(publicDir, "share-not-found.html"), assetHtml);
  ctx = await setupRetrieval({ env: { XYLEM_STATIC_DIR: publicDir } });
});
afterEach(async () => {
  await ctx?.cleanup();
  await rm(publicDir, { recursive: true, force: true });
});

it("returns the configured static HTML unchanged as an uncached 404 without redirecting", async () => {
  vi.stubEnv("XYLEM_STATIC_DIR", relative(process.cwd(), publicDir));
  ctx.fetchMock.mockResolvedValueOnce(new Response("PRIVATE_UPSTREAM", { status: 404 }));
  const response = await ctx.app.request(`https://local/s/${shareId}`);
  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Location")).toBeNull();
  expect(await response.text()).toBe(assetHtml);
  expect(await readdir(ctx.cache)).toEqual([]);
  expect((await ctx.app.request(`https://local/s/${shareId}`)).status).toBe(200);
});

it.each(["missing", "unreadable"])("falls back to the original JSON 404 when the asset is %s", async availability => {
  await rm(join(publicDir, "share-not-found.html"));
  // A directory deterministically fails readFile, even under privileged test users.
  if (availability === "unreadable") await mkdir(join(publicDir, "share-not-found.html"));
  ctx.fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const response = await ctx.app.request(`https://local/s/${shareId}`);
  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect(response.headers.get("Location")).toBeNull();
  expect(await response.json()).toEqual({ error: "Not Found" });
  expect(await readdir(ctx.cache)).toEqual([]);
});

it.each([true, false])("logs an invalid public ID exactly once with the HTML asset present=%s", async present => {
  if (!present) await rm(join(publicDir, "share-not-found.html"));
  const response = await ctx.app.request("https://local/s/invalid-id");
  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe(present ? "text/html; charset=UTF-8" : "application/json");
  if (present) expect(await response.text()).toBe(assetHtml);
  else expect(await response.json()).toEqual({ error: "Not Found" });
  expect(ctx.fetchMock).not.toHaveBeenCalled();
  expect(ctx.logs.filter(event => event.event === "gpx_retrieval_failed")).toEqual([
    expect.objectContaining({ event: "gpx_retrieval_failed", result: "failure", status: 404, failure_reason: "invalid_id" }),
  ]);
});

it("preserves JSON API not-found responses", async () => {
  ctx.fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const response = await ctx.app.request(`https://local/api/gpx/${shareId}?lang=ja`);
  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect(await response.json()).toEqual({ error: "Not Found" });
});

it("serves cached HTML without fetching, even after GPX deletion, until a cache miss", async () => {
  const fresh = await ctx.app.request(`https://local/s/${shareId}`);
  expect(fresh.status).toBe(200);
  expect(ctx.fetchMock).toHaveBeenCalledOnce();
  const html = await fresh.text();
  ctx.fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
  const cached = await ctx.app.request(`https://local/s/${shareId}`);
  expect(cached.status).toBe(200);
  expect(await cached.text()).toBe(html);
  expect(ctx.fetchMock).toHaveBeenCalledOnce();
  await rm(join(ctx.cache, `${shareId}.html`));
  const missing = await ctx.app.request(`https://local/s/${shareId}`);
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain("GPX data not found");
  expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
});

it.each([503, "network"])("preserves upstream %s error semantics on a cache miss", async failure => {
  if (failure === "network") ctx.fetchMock.mockRejectedValueOnce(new Error("PRIVATE_NETWORK"));
  else ctx.fetchMock.mockResolvedValueOnce(new Response("PRIVATE_FAILURE", { status: failure as number }));
  const response = await ctx.app.request(`https://local/s/${shareId}`);
  expect(response.status).toBe(502);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect(await response.json()).toEqual({ error: "Bad Gateway" });
  expect(ctx.fetchMock).toHaveBeenCalledOnce();
  expect(await readdir(ctx.cache)).toEqual([]);
});
