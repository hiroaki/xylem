// Live, state-changing acceptance. Never imported by the local C1/C2 suites.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { policy } from "../helpers/phase-a.js";
import { processGpxInput } from "../../src/gpx/process.js";
import { downloadAndCompare } from "../browser/gpx-export.js";
import { assertRunResource, stagingPolicy } from "./safety.js";

import { installStagingRequestGuard } from "./request-guard.js";
import { cases } from "./cases.js";

const policyTarget = stagingPolicy();
const { target } = policyTarget;

for (const fixture of cases) test(fixture.name, async ({ page, context, request }, info) => {
  const errors: string[] = [], failedAssets: string[] = [];
  const created = new Map<string, string>(); // deletion capabilities remain memory-only
  const ledger = info.outputPath("created-resources.jsonl");
  const record = (event: object) => appendFile(ledger, JSON.stringify({ at: new Date().toISOString(), run: info.testId, ...event }) + "\n", { mode: 0o600 });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    const req = response.request();
    if (["script", "stylesheet"].includes(req.resourceType()) && !response.ok()) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", req => {
    if (["script", "stylesheet"].includes(req.resourceType())) failedAssets.push(`network ${req.url()}`);
  });
  // Await installation before the first application navigation. The guard
  // sends real HTTP requests without redirects and never hands a 3xx to Chromium.
  const guard = await installStagingRequestGuard(context, policyTarget);
  await record({ event: "start", target, fixture: fixture.name });
  try {
    const response = await page.goto("/?lang=en");
    expect(response?.status()).toBe(200);
    await expect(page.locator("#select-file-button")).toBeEnabled();
    const name = `phase-d-${randomUUID()}.gpx`;
    const input = fixture.xml + `\n<!-- Phase D run ${randomUUID()} -->`;
    const normalized = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/normalize");
    await page.locator("#file-input").setInputFiles({ name, mimeType: "application/gpx+xml", buffer: Buffer.from(input) });
    const preview = await normalized;
    expect(preview.status()).toBe(200);
    expect(processGpxInput(await preview.text(), policy)).toEqual(fixture.expected);
    const normalizeFile = (await (new Response(new Uint8Array(preview.request().postDataBuffer() ?? []).buffer, { headers: { "Content-Type": preview.request().headers()["content-type"] } })).formData()).get("file") as File;
    expect(await normalizeFile.text()).toBe(input);
    await expect(page.locator("#upload-button")).toBeEnabled();
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeInViewport();
    const uploading = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/upload");
    await record({ event: "upload-started", filename: name });
    await page.locator("#upload-button").click(); // exactly one upload, no retries
    const uploaded = await uploading;
    expect(uploaded.status()).toBe(200);
    const receipt = await uploaded.json();
    if (typeof receipt.id !== "string" || typeof receipt.deleteToken !== "string" || !receipt.deleteToken) throw new Error("Upload receipt lacks ID/deletion capability; inspect upload-started record manually");
    created.set(receipt.id, receipt.deleteToken);
    assertRunResource(receipt.id, created);
    await record({ event: "created", id: receipt.id });
    const uploadedFile = (await (new Response(new Uint8Array(uploaded.request().postDataBuffer() ?? []).buffer, { headers: { "Content-Type": uploaded.request().headers()["content-type"] } })).formData()).get("file") as File;
    expect(await uploadedFile.text()).toBe(input);
    expect(uploadedFile.name).toBe(name);
    await expect(page.locator("#result-section")).toBeVisible();
    const shareUrl = new URL(await page.locator("#share-url").inputValue());
    expect(shareUrl.origin).toBe(target);
    expect(shareUrl.pathname).toBe(`/s/${receipt.id}`);
    const xmlResponse = page.waitForResponse(r => new URL(r.url()).origin === target && new URL(r.url()).pathname === `/api/gpx/${receipt.id}`);
    expect((await page.goto(shareUrl.href))?.status()).toBe(200);
    const retrieved = await xmlResponse;
    expect(retrieved.status()).toBe(200);
    expect(retrieved.headers()["content-type"]).toContain("application/gpx+xml");
    expect(processGpxInput(await retrieved.text(), policy)).toEqual(fixture.expected);
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeInViewport();
    await expect(page.locator("#viewer-error")).toBeHidden();
    if (fixture.name === "rich mixed") {
      await page.locator(".tilia-route-point-marker").first().click();
      await expect(page.locator(".leaflet-popup-content")).toContainText("Start");
      await expect(page.locator(".leaflet-popup-content")).toContainText("Meeting & <safe>");
      await page.getByRole("button", { name: "Layers", exact: true }).click();
      const visible = page.locator(".tilia-layer-visible").first();
      await visible.uncheck();
      await expect(page.locator(".tilia-route-point-marker")).toHaveCount(0);
      await visible.check();
      await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
    }
    await downloadAndCompare(page, fixture.expected);
    await page.goto(`/viewer.html?gpx=${encodeURIComponent(`${target}/api/gpx/${receipt.id}`)}`);
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon, path.leaflet-interactive").first()).toBeInViewport();
    await downloadAndCompare(page, fixture.expected);
    expect(errors, "Unhandled page errors/rejections").toEqual([]);
    expect(failedAssets, "Script/stylesheet HTTP failures").toEqual([]);
    expect(guard.blocked, "Blocked HTTP requests/redirects; inspect the allowlist and deployment").toEqual([]);
    await record({ event: "acceptance-passed", id: receipt.id });
  } finally {
    info.setTimeout(info.timeout + 90_000); // reserve a bounded cleanup budget
    // Never enumerate storage or use IDs from previous runs/fixtures.
    for (const [id, token] of created) {
      assertRunResource(id, created);
      try {
        const deleted = await request.delete(`${target}/api/gpx/${id}`, { headers: { "X-Delete-Token": token }, maxRedirects: 0, maxRetries: 0, timeout: 15_000 });
        await record({ event: "cleanup", id, status: deleted.status() });
        expect(deleted.status(), `Cleanup failed for created resource ${id}; retain ledger`).toBe(200);
        await expect.poll(async () => (await request.get(`${target}/api/gpx/${id}`, { maxRedirects: 0, maxRetries: 0, timeout: 10_000 })).status(),
          { timeout: 70_000, intervals: [1000, 2000, 5000], message: `Deleted GPX ${id} should disappear (read-only polling)` }).toBe(404);
      } catch (error) {
        await record({ event: "cleanup-failed", id });
        throw error;
      }
    }
  }
});
