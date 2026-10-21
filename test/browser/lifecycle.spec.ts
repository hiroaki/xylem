import { test, expect } from "./harness.js";
import type { Page } from "@playwright/test";

async function hide(page: Page, persisted = false) {
  await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted })), persisted);
}
async function settled(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function destroyed(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as any).c2?.destroyed)).toBe(true);
  await expect(page.locator(".leaflet-pane")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).c2.subscriptions)).toBe(0);
}

test("persisted pagehide retains the app; final teardown unsubscribes and destroys once", async ({ page, id }) => {
  await page.goto(`/s/${id}`);
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).c2.subscriptions)).toBe(1);
  await hide(page, true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).c2.destroys)).toBe(0);
  await hide(page); await destroyed(page); await hide(page);
  expect(await page.evaluate(() => (window as any).c2.destroys)).toBe(1);
});

for (const phase of ["Ready", "Load"]) test(`late ${phase.toLowerCase()} completion cannot revive the viewer`, async ({ page, id }) => {
  await page.addInitScript(phase => { (window as any)["c2Delay" + phase] = true; }, phase);
  await page.goto(`/s/${id}`);
  await page.waitForFunction(phase => !!(window as any).c2?.["release" + phase], phase);
  if (phase === "Load") await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  await hide(page); await destroyed(page);
  await page.evaluate(phase => (window as any).c2["release" + phase](), phase);
  await settled(page);
  await expect(page.locator(".leaflet-pane")).toHaveCount(0);
  await expect(page.locator("#viewer-error")).toBeHidden();
  expect(await page.evaluate(() => (window as any).c2.files.length)).toBe(phase === "Ready" ? 0 : 1);
});

test("teardown aborts the host fetch and ignores a transport completing after abort", async ({ page, id }) => {
  await page.addInitScript(id => {
    const w = window as any, fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input !== `/api/gpx/${id}`) return fetch(input, init);
      w.primarySignal = init?.signal;
      // Deliberately uncooperative transport: real response, withheld until after teardown.
      const response = await fetch(input);
      const body = await response.arrayBuffer();
      return new Promise(resolve => { w.releasePrimary = () => resolve(new Response(body, { headers: response.headers })); });
    };
  }, id);
  await page.goto(`/s/${id}`);
  await page.waitForFunction(() => !!(window as any).releasePrimary);
  await hide(page); await destroyed(page);
  expect(await page.evaluate(() => (window as any).primarySignal.aborted)).toBe(true);
  await page.evaluate(() => (window as any).releasePrimary()); await settled(page);
  expect(await page.evaluate(() => (window as any).c2.files)).toEqual([]);
  await expect(page.locator("#viewer-error")).toBeHidden();
});

test("module completion after teardown never creates an application", async ({ page, id }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const pending = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\/tilia\/src\/index\.js$/, async route => {
    requested(); await gate;
    await route.fulfill({ contentType: "text/javascript", body: `window.c2ModuleEvaluated = true;
      export function createDefaultTiliaApp() { window.c2FactoryCalled = true; throw new Error("Must not create after teardown"); }` });
  });
  await page.goto(`/s/${id}`, { waitUntil: "commit" }); await pending;
  await hide(page); release();
  await page.waitForFunction(() => (window as any).c2ModuleEvaluated);
  await settled(page);
  expect(await page.evaluate(() => (window as any).c2FactoryCalled)).toBeUndefined();
  await expect(page.locator("#viewer-error")).toBeHidden();
});

test("destruction rejection is caught without a late visible error", async ({ page, id }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => { (window as any).c2BootFault = "destroy"; });
  await page.goto(`/s/${id}`);
  await expect(page.locator(".tilia-route-point-marker")).toHaveCount(2);
  await hide(page); await destroyed(page);
  await expect.poll(() => errors.some(error => error.includes("Injected destruction failure"))).toBe(true);
  await expect(page.locator("#viewer-error")).toBeHidden();
});
