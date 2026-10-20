import { test, expect, mixed, seed, calls } from "./harness.js";

const plugins = ["tilia-gpx-domain", "tilia-gpx-input", "tilia-gpx-renderer", "tilia-gpx-ui", "tilia-map-selection-presenter", "tilia-status", "tilia-base-maps-control", "tilia-panel", "tilia-toolbar", "tilia-layers", "tilia-elevation", "tilia-query-import", "x-gsi-base-maps", "x-opentopomap-base-maps", "x-gpx-export"];
async function active(page: any, count = 1) {
  await expect.poll(() => page.evaluate(() => (window as any).c2?.app.rendering.list().map((s: any) => s.state))).toEqual(Array(count).fill("active"));
}

test("actual generated HTML retrieves real GPX XML, renders mixed data and preserves metadata", async ({ page, id, request }) => {
  const failures: string[] = [];
  page.on("response", r => { if (/\.(js|css|png)(\?|$)/.test(r.url()) && !r.ok()) failures.push(r.url()); });
  const xml = page.waitForResponse(r => new URL(r.url()).pathname === `/api/gpx/${id}`);
  const response = await page.goto(`/s/${id}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("text/html; charset=UTF-8");
  expect((await xml).headers()["content-type"]).toBe("application/gpx+xml; charset=utf-8");
  await active(page);
  expect(await calls(request, id)).toBe(2); // HTML canonical retrieval + browser GPX retrieval.
  expect(await page.evaluate(() => (window as any).c2.app.listPlugins())).toEqual(plugins);
  const result = await page.evaluate(() => {
    const c = (window as any).c2, app = c.app, entry = app.entries.list()[0];
    const document = app.domains.gpx.getDocument(entry.id).document;
    const extent = app.domains.gpx.getExtent(entry.id).bounds;
    return { document, fits: c.fits, file: c.files[0],
      contains: app.map.getBounds().contains([extent.southWest.lat, extent.southWest.lon]) && app.map.getBounds().contains([extent.northEast.lat, extent.northEast.lon]) };
  });
  expect(result.file.name).toBe(id + ".gpx");
  expect(result.file.type.split(";")[0]).toBe("application/gpx+xml");
  expect(result.file.text).toContain("<gpx");
  expect(result.document.routes[0]).toMatchObject({ name: "Empty route", points: [] });
  expect(result.document.routes[1]).toMatchObject({ name: "Route", description: "Route description", points: [{ name: "Start", description: "Meeting & <safe>", symbol: "Flag", elevation: 0, timestamp: Date.parse("2026-10-19T00:00:00.123Z") }, { name: "Finish" }] });
  expect(result.document.tracks[0].segments[0].points).toHaveLength(1);
  expect(result.fits).toBe(1); expect(result.contains).toBe(true);
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  await page.locator(".tilia-route-point-marker").first().click();
  await expect(page.locator(".leaflet-popup-content")).toContainText("Start");
  await expect(page.locator(".leaflet-popup-content")).toContainText("Meeting & <safe>");
  await expect(page.locator(".leaflet-popup-content safe")).toHaveCount(0);
  await expect(page).toHaveTitle(mixed().data.tracks[0].name + " - GPX Share (beta)");
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `http://127.0.0.1:4184/s/${id}`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await page.getByRole("button", { name: "GPX export", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export GPX", exact: true })).toBeEnabled();
  expect(await page.locator('link[data-tilia-stylesheet="tilia-gpx"]').evaluate((el: any) => !!el.sheet)).toBe(true);
  await expect(page.locator("#viewer-error")).toBeHidden(); expect(failures).toEqual([]);
});

for (const kind of ["waypoint", "route", "single-point track"]) test(`${kind} alone renders visibly and fits`, async ({ page, request, id }) => {
  const d = mixed();
  d.data.tracks = kind === "single-point track" ? [{ name: "Single", segments: [{ points: [{ coordinates: [139.76, 35.68] }] }] }] : [];
  d.data.routes = kind === "route" ? [{ name: "Single", desc: "Route", points: [{ coordinates: [139.76, 35.68] }] }] : [];
  d.data.waypoints = kind === "waypoint" ? [{ name: "Single", coordinates: [139.76, 35.68] }] : [];
  await seed(request, id, d); await page.goto(`/s/${id}`); await active(page);
  expect(await page.evaluate(() => ({ fits: (window as any).c2.fits, contains: (window as any).c2.app.map.getBounds().contains([35.68, 139.76]) }))).toEqual({ fits: 1, contains: true });
  await expect(page.locator(kind === "single-point track" ? "path.leaflet-interactive" : ".leaflet-marker-icon")).toHaveCount(1);
});

for (const fault of ["module", "factory", "ready", "load", "failed", "unavailable", "initial-render"]) test(`${fault} failure is visible and handled`, async ({ page, id }) => {
  if (fault === "module") await page.route(/\/tilia\/src\/index\.js$/, route => route.fulfill({ status: 404, body: "Missing module" }));
  else await page.addInitScript(fault => { (window as any).c2BootFault = fault; }, fault);
  await page.goto(`/s/${id}`);
  await expect(page.locator("#viewer-error")).toBeVisible();
  await expect(page.locator("#viewer-error")).not.toBeEmpty();
});

for (const failure of ["http", "network", "invalid GPX"]) test(`primary ${failure} retrieval failure is visible`, async ({ page, id }) => {
  await page.route(`**/api/gpx/${id}`, route => failure === "network" ? route.abort() : route.fulfill(failure === "http"
    ? { status: 502, body: "PRIVATE_SERVER_BODY" } : { contentType: "application/gpx+xml", body: "invalid XML" }));
  await page.goto(`/s/${id}`);
  await expect(page.locator("#viewer-error")).toBeVisible();
  await expect(page.locator("#viewer-error")).not.toContainText("PRIVATE_SERVER_BODY");
});

test("fresh, cached and manually regenerated actual HTML load the same Birch assets", async ({ page, request, id }) => {
  await page.goto(`/s/${id}`); await active(page); expect(await calls(request, id)).toBe(2);
  await page.reload(); await active(page); expect(await calls(request, id)).toBe(3);
  const changed = mixed(); changed.data.tracks[0].name = "After test cache removal";
  await seed(request, id, changed);
  expect((await request.delete(`/__c2/cache/${id}`)).ok()).toBe(true);
  await page.reload(); await active(page); expect(await calls(request, id)).toBe(5);
  await expect(page).toHaveTitle("After test cache removal - GPX Share (beta)");
});

test("cached HTML remains 200 when the underlying resource disappears, then reports GPX 404", async ({ page, request, id }) => {
  expect((await request.get(`/s/${id}`)).status()).toBe(200);
  await seed(request, id, null, 404);
  expect((await request.get(`/s/${id}`)).status()).toBe(200);
  const response = await page.goto(`/s/${id}`); expect(response?.status()).toBe(200);
  await expect(page.locator("#viewer-error")).toHaveText("GPX request failed: 404");
});

test("query failure does not prevent primary loading", async ({ page, id }) => {
  await page.route("https://query.example/extra.gpx", route => route.fulfill({ status: 404, body: "Missing" }));
  await page.goto(`/s/${id}?gpx=${encodeURIComponent("https://query.example/extra.gpx")}`);
  await active(page);
  await expect(page.locator(".tilia-status-text")).toContainText("HTTP 404");
  await expect(page.locator("#viewer-error")).toBeHidden();
});

test("query import and primary ID load coexist independently", async ({ page, id }) => {
  await page.route("https://query.example/extra.gpx", route => route.fulfill({ contentType: "application/gpx+xml",
    body: '<gpx version="1.1"><wpt lat="35.7" lon="139.8"><name>Extra query point</name></wpt></gpx>' }));
  await page.goto(`/s/${id}?gpx=${encodeURIComponent("https://query.example/extra.gpx")}`);
  await active(page, 2);
  const names = await page.evaluate(() => (window as any).c2.app.entries.list().map((entry: any) => (window as any).c2.app.domains.gpx.getDocument(entry.id).document.waypoints.map((p: any) => p.name)));
  expect(names.flat()).toContain("Extra query point"); expect(names.flat()).toContain("Waypoint");
});

test("unwrapped actual generated viewer works with the real public factory", async ({ page, id }) => {
  await page.unroute(/\/tilia\/src\/index\.js$/);
  await page.goto(`/s/${id}`);
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  await expect(page.locator("#viewer-error")).toBeHidden();
});
