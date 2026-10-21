// Test-only composition: real Xylem routes/static serving, local storage fixture.
// Control endpoints below are never registered in the production application.
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";

const checkout = process.env.GPX_SHARE_CHECKOUT;
if (!checkout) throw new Error("GPX_SHARE_CHECKOUT must explicitly name the C1 checkout");
const publicRoot = resolve(checkout, "public");
const revision = (await readFile(join(publicRoot, "tilia/version.txt"), "utf8")).trim();
if (revision !== "44921a90b3446decb4246a7948c7b53c3101a7d2") {
  throw new Error("C2 browser tests require the approved C1 Tilia revision");
}
await stat(join(publicRoot, "tilia/src/index.js"));
const cache = await mkdtemp(join(tmpdir(), "xylem-c2-browser-"));
const resources = new Map<string, { document: unknown; status?: number }>();
const calls = new Map<string, number>();
const storage = createServer((request, response) => {
  const id = /^\/api\/gpx\/([a-zA-Z0-9-]+)$/.exec(request.url ?? "")?.[1];
  if (!id || request.method !== "GET") {
    response.writeHead(405); response.end(); return;
  }
  calls.set(id, (calls.get(id) ?? 0) + 1);
  const resource = resources.get(id);
  response.writeHead(resource?.status ?? (resource ? 200 : 404), { "Content-Type": "application/json" });
  response.end(JSON.stringify(resource?.document ?? { error: "Not found" }));
});
await new Promise<void>(resolve => storage.listen(0, "127.0.0.1", resolve));
const address = storage.address();
if (!address || typeof address === "string") throw new Error("Storage fixture failed to start");
Object.assign(process.env, {
  ANEMOCHORE_API_URL: `http://127.0.0.1:${address.port}`,
  ANEMOCHORE_API_KEY: "c2-test-key", XYLEM_DELETE_SECRET: "c2-test-secret",
  XYLEM_PUBLIC_ORIGIN: "http://127.0.0.1:4184",
  CHLOROPLAST_PUBLIC_ORIGIN: "http://127.0.0.1:4184",
  XYLEM_STATIC_DIR: publicRoot, SHARE_CACHE_DIR: cache, LOG_LEVEL: "error",
  GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
  XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
  XYLEM_TRUST_PROXY: "false",
});
const { createApp } = await import("../../src/app.js");
const app = createApp();
const server = serve({ hostname: "127.0.0.1", port: 4184, fetch: async request => {
  const path = new URL(request.url).pathname;
  const control = /^\/__c2\/(resource|cache|info)\/([0-9a-f-]+)$/i.exec(path);
  if (!control) return app.fetch(request);
  const [, operation, id] = control;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(null, { status: 400 });
  }
  if (operation === "resource" && request.method === "PUT") {
    resources.set(id, await request.json() as { document: unknown; status?: number });
    return Response.json({ ok: true });
  }
  if (operation === "cache" && request.method === "DELETE") {
    await rm(join(cache, `${id}.html`), { force: true });
    return Response.json({ ok: true });
  }
  if (operation === "info" && request.method === "GET") {
    return Response.json({ calls: calls.get(id) ?? 0 });
  }
  return new Response(null, { status: 405 });
} });
process.once("SIGTERM", () => {
  server.close(); server.closeAllConnections();
  storage.close(); storage.closeAllConnections();
  void rm(cache, { recursive: true, force: true }).then(() => process.exit(0));
});
