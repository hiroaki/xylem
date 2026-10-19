import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const mixed = () => ({ schema_version: 1, data_type: "gpx", data: {
  tracks: [{ name: 'Track </title><script>window.injected=true</script> & {{ID}}', segments: [
    { points: [{ coordinates: [139.75, 35.67, 0], time: "2026-10-19T00:00:00Z" }] },
    { points: [{ coordinates: [139.751, 35.671] }, { coordinates: [139.752, 35.672] }] },
  ] }],
  routes: [{ name: "Empty route", desc: "Retained empty route", points: [] }, {
    name: "Route", desc: "Route description", points: [
      { coordinates: [139.77, 35.69, 0], name: "Start", desc: "Meeting & <safe>", sym: "Flag", time: "2026-10-19T09:00:00.123456+09:00" },
      { coordinates: [139.771, 35.691], name: "Finish" },
    ],
  }],
  waypoints: [{ coordinates: [139.76, 35.68], name: "Waypoint" }],
} });
export async function seed(request: APIRequestContext, id: string, document: unknown, status = 200) {
  expect((await request.put(`/__c2/resource/${id}`, { data: { document, status } })).ok()).toBe(true);
}
export async function calls(request: APIRequestContext, id: string) {
  return (await (await request.get(`/__c2/info/${id}`)).json()).calls as number;
}
export const test = base.extend<{ id: string }>({
  id: async ({ request }, use) => {
    const id = randomUUID();
    await seed(request, id, mixed());
    await use(id);
  },
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://**/*", async route => {
      const url = new URL(route.request().url());
      const prefix = "/leaflet@2.0.0-alpha.1/dist/";
      if (url.hostname === "unpkg.com" && url.pathname.startsWith(prefix)) {
        const name = url.pathname.slice(prefix.length);
        return route.fulfill({ body: await readFile(resolve("node_modules/leaflet/dist", name)),
          contentType: name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "image/png" });
      }
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hfkAAAAASUVORK5CYII=", "base64") });
      return route.abort();
    });
    // Delegate to the actual vendored factory. Wrap only documented public
    // facades, never mutate vendor files or reach into rendering internals.
    await page.route(/\/tilia\/src\/index\.js$/, route => route.fulfill({ contentType: "text/javascript", body: `
      export * from "/tilia/src/index.js?c2-real";
      import { createDefaultTiliaApp as create } from "/tilia/src/index.js?c2-real";
      export function createDefaultTiliaApp(container, options) {
        if (window.c2BootFault === "factory") throw new Error("Injected factory failure");
        if (window.c2BootFault === "ready") options = { ...options, plugins: [...options.plugins, "tilia-missing"] };
        const app = create(container, options);
        const c = window.c2 = { app, fault: window.c2BootFault, files: [], fits: 0, subscriptions: 0, destroys: 0 };
        for (const phase of ["Ready", "Load"]) {
          if (window["c2Delay" + phase]) c[phase.toLowerCase() + "Gate"] = new Promise(resolve => { c["release" + phase] = resolve; });
        }
        const fit = app.map.fitBounds.bind(app.map);
        app.map.fitBounds = (...args) => { c.fits++; return fit(...args); };
        const project = value => ["failed", "unavailable"].includes(c.fault) ? { ...value, state: c.fault } : value;
        return { ready: app.ready.then(async () => { if (c.readyGate) await c.readyGate; }),
          get rendering() {
            const rendering = app.rendering;
            return { ...rendering, subscribe(listener, options) {
              c.subscriptions++;
              const handle = rendering.subscribe(value => listener(Array.isArray(value) ? value.map(project) : project(value)), options);
              if (c.fault === "initial-render") listener([{ state: "failed" }]);
              return { unsubscribe() { c.subscriptions--; handle.unsubscribe(); } };
            } };
          },
          async load(file) {
            c.files.push({ name: file.name, type: file.type, text: await file.text() });
            if (c.fault === "load") throw new Error("Injected load failure");
            const result = await app.load(file);
            if (c.loadGate) await c.loadGate;
            return result;
          },
          async destroy() {
            c.destroys++;
            await app.destroy();
            c.destroyed = true;
            if (c.fault === "destroy") throw new Error("Injected destruction failure");
          },
        };
      }
    ` }));
    await use(page);
    expect(errors, "No unhandled browser errors or promise rejections").toEqual([]);
  },
});
export { expect };
