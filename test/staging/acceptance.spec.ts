// Live, state-changing acceptance. Never imported by the local C1/C2 suites.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { parse as parseHtml } from "parse5";
import { createScanner, SyntaxKind } from "typescript/unstable/ast";
import { policy } from "../helpers/phase-a.js";
import { processGpxInput } from "../../src/gpx/process.js";
import { downloadAndCompare } from "../browser/gpx-export.js";
import { assertRunResource, stagingPolicy } from "./safety.js";

import { installStagingRequestGuard } from "./request-guard.js";
import { cases } from "./cases.js";

const policyTarget = stagingPolicy();
const { target } = policyTarget;

// Parse HTML and JavaScript without executing either. Fail closed on an
// unrecognized initialization shape, spreads, or nonliteral plugin options.
function assertMilestoneDisabledHtml(html: string) {
  const scripts: string[] = [];
  const visitHtml = (node: any) => {
    if (node.tagName === "script" && node.attrs.some((a: any) => a.name === "type" && a.value === "module")) {
      expect(node.attrs.some((a: any) => a.name === "src"), "Viewer initialization must be inspectable inline").toBe(false);
      scripts.push(node.childNodes.map((n: any) => n.value ?? "").join(""));
    }
    for (const child of node.childNodes ?? []) visitHtml(child);
  };
  visitHtml(parseHtml(html));
  expect(scripts, "Expected one deployed viewer module").toHaveLength(1);
  const scanner = createScanner(true, undefined, scripts[0]);
  const tokens: { kind: SyntaxKind; text: string; value: string }[] = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (scanner.isUnterminated()) throw new Error("Unterminated viewer JavaScript token");
    tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  }
  const calls = tokens.flatMap((token, i) => token.kind === SyntaxKind.Identifier
    && token.value === "createDefaultTiliaApp" && tokens[i + 1]?.text === "(" ? [i] : []);
  expect(calls, "Expected one explicit viewer factory call").toHaveLength(1);
  let i = calls[0] + 2;
  if (tokens[i]?.kind !== SyntaxKind.StringLiteral || tokens[i].value !== "map"
    || tokens[++i]?.text !== "," || tokens[++i]?.text !== "{") throw new Error("Unrecognized viewer factory arguments");
  // Accept only literal JSON-like options, with identifier keys and trailing
  // commas. Tokenization excludes comments and decodes escaped plugin IDs.
  // Never eval deployed code; expressions, spreads and computed keys fail.
  const json: string[] = [], stack: string[] = [];
  let pluginLists = 0;
  do {
    const token = tokens[i], next = tokens[i + 1];
    if (!token) throw new Error("Incomplete viewer options");
    if (next?.text === ":" && token.value === "plugins") pluginLists++;
    if (token.kind === SyntaxKind.StringLiteral || (token.kind === SyntaxKind.Identifier && next?.text === ":")) {
      json.push(JSON.stringify(token.value));
    } else if (token.kind === SyntaxKind.NumericLiteral || ["true", "false", "null", "-"].includes(token.text)) {
      json.push(token.text);
    } else if (["{", "[", "}", "]", ":", ","].includes(token.text)) {
      if (["{", "["].includes(token.text)) stack.push(token.text);
      if (["}", "]"].includes(token.text) && stack.pop() !== (token.text === "}" ? "{" : "[")) throw new Error("Unbalanced viewer options");
      if (!(token.text === "," && ["}", "]"].includes(next?.text))) json.push(token.text);
    } else throw new Error("Nonliteral viewer options");
    i++;
  } while (stack.length);
  if (tokens[i]?.text !== ")" || pluginLists !== 1) throw new Error("Unrecognized viewer plugin configuration");
  const options = JSON.parse(json.join(""));
  const ids: unknown = options.plugins;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === "string")) throw new Error("Nonliteral viewer plugin list");
  expect(ids).toEqual(expect.arrayContaining(["tilia-gpx-input", "tilia-gpx-renderer", "tilia-query-import"]));
  expect(ids, "Deployed viewer must disable x-milestone before GPX loading").not.toContain("x-milestone");
}

for (const fixture of cases) test(fixture.name, async ({ page, context, request }, info) => {
  const wideArea = fixture.name === "wide-area B5";
  const errors: string[] = [], failedAssets: string[] = [];
  const created = new Map<string, string>(); // deletion capabilities remain memory-only
  // A horizontal SVG path has zero layout height despite its painted stroke.
  // Check any visible GPX element against both the map and browser viewport.
  const hasVisibleGpxInViewport = () => page.locator("#map").locator(
    ".leaflet-marker-icon:visible, path.leaflet-interactive:visible",
  ).evaluateAll(elements => {
    const map = document.querySelector("#map");
    if (!map) return false;
    const bounds = map.getBoundingClientRect();
    return elements.some(element => {
      const rect = element.getBoundingClientRect();
      return Math.min(rect.right, bounds.right, innerWidth) > Math.max(rect.left, bounds.left, 0)
        && Math.min(rect.bottom, bounds.bottom, innerHeight) > Math.max(rect.top, bounds.top, 0);
    });
  });
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
  const milestoneRequests: string[] = [];
  let viewerApproved = Promise.resolve();
  // Registered last: denied plugin requests never reach the network. All other
  // requests still pass through the unchanged staging guard via fallback().
  if (wideArea) await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (/\/plugins\/x-milestone(?:\/|$)/.test(decodeURIComponent(url.pathname))) {
      milestoneRequests.push(url.href);
      await route.abort("blockedbyclient");
      return;
    }
    if (url.origin === target && url.pathname.startsWith("/api/gpx/")) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Do not deliver GPX until the actual navigation HTML is also checked.
        await Promise.race([viewerApproved, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Viewer HTML approval timed out")), 10_000);
        })]);
      } catch {
        await route.abort("blockedbyclient");
        return;
      } finally { clearTimeout(timer); }
    }
    await route.fallback();
  });
  const openWideViewer = async (href: string, id: string) => {
    assertRunResource(id, created);
    const url = new URL(href, target);
    expect(url.origin).toBe(target);
    expect(policyTarget.origins).toContain(url.origin);
    expect([`/s/${id}`, "/viewer.html"]).toContain(url.pathname);
    let approve!: () => void;
    viewerApproved = new Promise<void>(resolve => { approve = resolve; });
    const navigation = await page.goto(url.href, { waitUntil: "commit" });
    expect(navigation?.status()).toBe(200);
    expect(navigation?.headers()["content-type"]).toContain("text/html");
    assertMilestoneDisabledHtml(await navigation!.text());
    approve();
  };
  const checkWideViewer = async (viewer: "shared" | "static") => {
    // Deployed pages keep app private: check ready UI plus actual GPX geometry,
    // without replacing their modules or exposing an instrumented app instance.
    await expect(page.locator(".tilia-status-text")).toContainText(viewer === "shared" ? "Ready" : "Loaded 1 file(s) from query.");
    const track = page.locator('#map path.leaflet-interactive[fill="none"]').first();
    await expect(page.locator('#map path.leaflet-interactive[fill="none"]')).toHaveCount(2);
    await expect(track).toBeVisible();
    await expect(track).toBeInViewport();
    await expect(page.locator(".tilia-milestone")).toHaveCount(0);
    const pane = page.locator("#map .leaflet-map-pane");
    await expect(pane).not.toHaveClass(/leaflet-zoom-anim/);
    const beforeZoom = await track.getAttribute("d");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(track).not.toHaveAttribute("d", beforeZoom!);
    await expect(pane).not.toHaveClass(/leaflet-zoom-anim/);
    const beforePan = await pane.evaluate(element => element.style.transform);
    const box = await page.locator("#map").boundingBox();
    if (!box) throw new Error("Map has no viewport");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height * 0.7 + 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => pane.evaluate(element => element.style.transform)).not.toBe(beforePan);
    await expect(page.locator("#viewer-error")).toBeHidden();
    await expect(page.locator(".tilia-milestone")).toHaveCount(0);
    expect(milestoneRequests).toEqual([]);
  };
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
    await expect.poll(hasVisibleGpxInViewport, {
      message: "At least one visible GPX element must intersect the map viewport",
    }).toBe(true);
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
    if (wideArea) await openWideViewer(shareUrl.href, receipt.id);
    else expect((await page.goto(shareUrl.href))?.status()).toBe(200);
    const retrieved = await xmlResponse;
    expect(retrieved.status()).toBe(200);
    expect(retrieved.headers()["content-type"]).toContain("application/gpx+xml");
    // Guarded Blob/File responses can have an empty Playwright browser body.
    // Keep the browser checks above; verify XML through one explicit, scoped GET.
    assertRunResource(receipt.id, created);
    const gpxUrl = new URL(`/api/gpx/${encodeURIComponent(receipt.id)}`, target);
    expect(gpxUrl.origin).toBe(target);
    expect(policyTarget.origins).toContain(gpxUrl.origin);
    const canonicalResponse = await request.get(gpxUrl.href, {
      maxRedirects: 0, maxRetries: 0, timeout: 10_000,
    });
    expect(canonicalResponse.status()).toBe(200);
    expect(canonicalResponse.headers()["content-type"]).toContain("application/gpx+xml");
    expect(processGpxInput(await canonicalResponse.text(), policy)).toEqual(fixture.expected);
    await expect.poll(hasVisibleGpxInViewport, {
      message: "At least one visible GPX element must intersect the map viewport",
    }).toBe(true);
    await expect(page.locator("#viewer-error")).toBeHidden();
    if (wideArea) await checkWideViewer("shared");
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
    const staticUrl = `/viewer.html?gpx=${encodeURIComponent(`${target}/api/gpx/${receipt.id}`)}`;
    if (wideArea) await openWideViewer(staticUrl, receipt.id);
    else await page.goto(staticUrl);
    await expect.poll(hasVisibleGpxInViewport, {
      message: "At least one visible GPX element must intersect the map viewport",
    }).toBe(true);
    if (wideArea) await checkWideViewer("static");
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
