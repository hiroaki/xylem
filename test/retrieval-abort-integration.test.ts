import { createServer } from "node:http";
import { once } from "node:events";
import { beforeAll, afterAll, expect, it } from "vitest";
import { setupRetrieval } from "./helpers/retrieval.js";

// Real loopback HTTP and native fetch; no external service or real KV.
const nativeFetch = globalThis.fetch;
const closed = new Set<string>();
let followed = 0;
const server = createServer((req, res) => {
  const name = req.url!.split("/").pop()!;
  res.on("close", () => closed.add(name));
  if (name === "headers") return;
  if (name === "body") {
    res.writeHead(200, {"Content-Type": "application/json"}); res.write('{"partial":'); return;
  }
  if (name === "redirect") {res.writeHead(302, {Location: "/api/gpx/final"}); res.end(); return;}
  followed++; res.writeHead(404); res.end("PRIVATE_UPSTREAM");
});
let ctx: Awaited<ReturnType<typeof setupRetrieval>>;
beforeAll(async () => {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback address unavailable");
  ctx = await setupRetrieval({apiUrl: `http://127.0.0.1:${address.port}`});
  ctx.fetchMock.mockImplementation((url, init) => nativeFetch(String(url), init));
});
afterAll(async () => {
  server.closeAllConnections(); server.close(); await once(server, "close");
  await ctx?.cleanup();
});
it.concurrent.each(["headers", "body"])("aborts native fetch waiting for %s at the fixed 10-second deadline", async phase => {
  const start = performance.now();
  const result = await ctx.app.request(`https://local/api/gpx/${phase}`);
  expect(result.status).toBe(504); expect(await result.json()).toEqual({error: "Gateway Timeout"});
  expect(performance.now() - start).toBeGreaterThanOrEqual(9900);
  const call = ctx.fetchMock.mock.calls.find(([url]) => String(url).endsWith("/" + phase));
  expect(call?.[1]?.signal?.aborted).toBe(true);
  for (let i = 0; i < 100 && !closed.has(phase); i++) await new Promise(resolve => setTimeout(resolve, 5));
  expect(closed.has(phase)).toBe(true);
  expect(JSON.stringify(ctx.logs)).not.toContain("PRIVATE");
}, 20000);
it("does not follow a real upstream redirect", async () => {
  const response = await ctx.app.request("https://local/api/gpx/redirect");
  expect(response.status).toBe(502); expect(followed).toBe(0);
});
