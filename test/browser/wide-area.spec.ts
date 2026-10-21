import { readFile } from "node:fs/promises";
import { test, expect, seed } from "./harness.js";
import { expectedCanonical, richGpx } from "../helpers/phase-b5.js";
import { policy } from "../helpers/phase-a.js";
import { processGpxInput } from "../../src/gpx/process.js";
import { downloadAndCompare } from "./gpx-export.js";

// Reusable GPX 1.1 serialization of phase-b5.ts richGpx/expectedCanonical.
// Preserve the two single-point segments: their inferred gap is ~14,266 km.
const xml = await readFile(new URL("../fixtures/b5-wide-area.gpx", import.meta.url), "utf8");

for (const viewer of ["generated", "static"]) {
  test(`${viewer} wide-area B5 viewer renders, pans, zooms and downloads without milestones`, async ({ page, request, id }) => {
    expect(processGpxInput(richGpx, policy)).toEqual(expectedCanonical);
    expect(processGpxInput(xml, policy)).toEqual(expectedCanonical);
    const milestoneRequests: string[] = [];
    // Fail safely if a regression enables the defective plugin; never execute it.
    await page.route(/\/plugins\/x-milestone\/loader\.js(?:\?|$)/, route => {
      milestoneRequests.push(route.request().url());
      return route.abort();
    });
    await seed(request, id, processGpxInput(xml, policy));
    const response = await page.goto(viewer === "generated" ? `/s/${id}`
      : `/viewer.html?gpx=${encodeURIComponent(new URL(`/api/gpx/${id}`, test.info().project.use.baseURL).href)}`);
    expect(response?.status()).toBe(200);
    expect(await response!.text()).not.toContain('"x-milestone"');
    await expect.poll(() => page.evaluate(() => (window as any).c2?.app.rendering.list().map((s: any) => s.state))).toEqual(["active"]);
    expect(await page.evaluate(() => (window as any).c2.app.listPlugins())).not.toContain("x-milestone");
    await expect(page.locator(".tilia-milestone")).toHaveCount(0);
    // One track joins the original two points; the other path is the route.
    await expect(page.locator('#map path.leaflet-interactive[fill="none"]')).toHaveCount(2);
    const track = page.locator('#map path.leaflet-interactive[fill="none"]').first();
    await expect(track).toBeVisible();
    await expect(track).toBeInViewport();
    expect(await page.evaluate(() => {
      const app = (window as any).c2.app;
      const extent = app.domains.gpx.getExtent(app.entries.list()[0].id).bounds;
      return app.map.getBounds().contains([extent.southWest.lat, extent.southWest.lon])
        && app.map.getBounds().contains([extent.northEast.lat, extent.northEast.lon]);
    })).toBe(true);
    // Initial fitBounds can still be animating after rendering becomes active.
    await expect(page.locator("#map .leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
    const zoom = await page.evaluate(() => (window as any).c2.app.map.getZoom());
    await page.locator(".leaflet-control-zoom-in").click();
    await expect.poll(() => page.evaluate(() => (window as any).c2.app.map.getZoom())).toBe(zoom + 1);
    await expect(page.locator("#map .leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
    const center = await page.evaluate(() => (window as any).c2.app.map.getCenter());
    const box = await page.locator("#map").boundingBox();
    if (!box) throw new Error("Map has no viewport");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height * 0.7 + 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as any).c2.app.map.getCenter())).not.toEqual(center);
    await downloadAndCompare(page, expectedCanonical);
    await expect(page.locator("#viewer-error")).toBeHidden();
    await expect(page.locator(".tilia-milestone")).toHaveCount(0);
    expect(milestoneRequests).toEqual([]);
  });
}
