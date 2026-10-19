import { test, expect, seed } from "./harness.js";
import { richMixed } from "./fixtures.js";
import { downloadAndCompare } from "./gpx-export.js";

for (const viewer of ["generated", "static"]) {
  test(`${viewer} viewer downloads and reparses the supported rich GPX subset`, async ({ page, request, id }) => {
    // Use the real factory as well as the real plugin/download, without wrappers.
    await page.unroute(/\/tilia\/src\/index\.js$/);
    await seed(request, id, richMixed());
    await page.goto(viewer === "generated" ? `/s/${id}` : `/viewer.html?gpx=${encodeURIComponent(new URL(`/api/gpx/${id}`, test.info().project.use.baseURL).href)}`);
    await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
    const xml = await downloadAndCompare(page, richMixed());
    expect(xml).toContain("2026-10-19T00:00:00.123Z");
    expect(xml).not.toContain(".123456");
  });

  for (const time of ["0001-01-01T00:00:00+14:00", "9999-12-31T23:59:59-14:00"]) {
    test(`${viewer} viewer visibly rejects unexportable year edge ${time}`, async ({ page, request, id }) => {
      await page.unroute(/\/tilia\/src\/index\.js$/);
      const document = richMixed();
      document.data.routes[1].points[0].time = time;
      await seed(request, id, document);
      await page.goto(viewer === "generated" ? `/s/${id}` : `/viewer.html?gpx=${encodeURIComponent(new URL(`/api/gpx/${id}`, test.info().project.use.baseURL).href)}`);
      await page.getByRole("button", { name: "GPX export", exact: true }).click();
      const downloads: string[] = [];
      page.on("download", download => downloads.push(download.suggestedFilename()));
      await page.getByRole("button", { name: "Export GPX", exact: true }).click();
      await expect(page.locator(".tilia-gpx-export-message")).toBeVisible();
      await expect(page.locator(".tilia-gpx-export-message")).toContainText("cannot be represented as an ISO timestamp");
      // Bounded observation after the synchronous serializer failure; the page
      // fixture also asserts absence of unhandled errors/rejections at teardown.
      await page.waitForTimeout(150);
      expect(downloads).toEqual([]);
      await expect(page.getByRole("button", { name: "Export GPX", exact: true })).toBeEnabled();
    });
  }
}
