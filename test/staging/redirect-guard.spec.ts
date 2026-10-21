import { test as base, expect, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { installStagingRequestGuard } from "./request-guard.js";
import { browserRequestAllowed } from "./safety.js";

type Hit = { method: string; path: string; body: string };
type Servers = { allowed: string; forbidden: string; hits: Hit[]; forbiddenHits: Hit[] };
async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local HTTP address");
  return `http://127.0.0.1:${address.port}`;
}
const test = base.extend<{ servers: Servers }>({
  servers: async ({}, use) => {
    const hits: Hit[] = [], forbiddenHits: Hit[] = [];
    const forbiddenServer = createServer(async (req, res) => {
      const body = []; for await (const chunk of req) body.push(chunk);
      forbiddenHits.push({ method: req.method!, path: req.url!, body: Buffer.concat(body).toString() });
      res.writeHead(200, { "Content-Type": "text/html" }); res.end("forbidden received");
    });
    forbiddenServer.on("upgrade", (req, socket) => {
      forbiddenHits.push({ method: req.method!, path: req.url!, body: "websocket-upgrade" }); socket.destroy();
    });
    const forbidden = await listen(forbiddenServer);
    let allowed: string;
    const allowedServer = createServer(async (req, res) => {
      const body = []; for await (const chunk of req) body.push(chunk);
      hits.push({ method: req.method!, path: req.url!, body: Buffer.concat(body).toString() });
      const path = new URL(req.url!, "http://local.test").pathname;
      if (path === "/broken") { req.socket.destroy(); return; }
      if (path === "/error") { res.writeHead(502, { "Content-Type": "text/html" }); res.end("real upstream error"); return; }
      if (path.startsWith("/redirect/")) {
        const code = Number(path.split("/").pop());
        res.writeHead(code, { Location: `${forbidden}/destination` }); res.end();
      } else if (path === "/same-origin-redirect") {
        res.writeHead(302, { Location: `${allowed}/ok` }); res.end();
      } else if (path.startsWith("/form/")) {
        const code = path.split("/").pop();
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<form method="POST" action="/redirect/${code}"><input name="probe" value="local-only"><button>Submit</button></form>`);
      } else {
        res.writeHead(200, { "Content-Type": "text/html", "X-Guard-Probe": "real-server" }); res.end("allowed response");
      }
    });
    try {
      allowed = await listen(allowedServer);
      await use({ allowed, forbidden, hits, forbiddenHits });
    } finally {
      await Promise.all([allowedServer, forbiddenServer].map(server => new Promise<void>(resolve => {
        server.close(() => resolve()); server.closeAllConnections();
      })));
    }
  },
});
async function guard(context: BrowserContext, servers: Servers) {
  return installStagingRequestGuard(context, { target: servers.allowed, origins: [servers.allowed] });
}

test("permitted real request succeeds without changing response or duplicating POST", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  const response = await page.goto(`${servers.allowed}/ok`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-guard-probe"]).toBe("real-server");
  await expect(page.locator("body")).toHaveText("allowed response");
  expect(await page.evaluate(async url => (await fetch(url, { method: "POST", body: "once" })).text(), `${servers.allowed}/ok`)).toBe("allowed response");
  expect(servers.hits.filter(hit => hit.method === "POST")).toEqual([{ method: "POST", path: "/ok", body: "once" }]);
  expect(installed.blocked).toEqual([]);
  expect(servers.forbiddenHits).toEqual([]);
});

test("direct forbidden navigation is blocked before any HTTP request", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await expect(page.goto(`${servers.forbidden}/destination`)).rejects.toThrow();
  expect(installed.blocked).toContainEqual({ url: `${servers.forbidden}/destination`, reason: "origin" });
  expect(servers.forbiddenHits).toEqual([]);
});

test("unlisted read subresource is blocked, not implicitly trusted as a CDN", async ({ page, context, servers }) => {
  await guard(context, servers);
  await page.goto(`${servers.allowed}/ok`);
  const result = await page.evaluate(async url => {
    try { await fetch(url); return "unexpected success"; } catch { return "blocked"; }
  }, `${servers.forbidden}/subresource`);
  expect(result).toBe("blocked");
  expect(servers.forbiddenHits).toEqual([]);
});

for (const code of [301, 302, 303, 307, 308]) test(`${code} navigation redirect never contacts forbidden destination`, async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await expect(page.goto(`${servers.allowed}/redirect/${code}`)).rejects.toThrow();
  expect(servers.hits).toContainEqual({ method: "GET", path: `/redirect/${code}`, body: "" });
  expect(installed.blocked).toContainEqual({ url: `${servers.allowed}/redirect/${code}`, reason: "redirect", status: code });
  expect(servers.forbiddenHits).toEqual([]);
});

for (const code of [307, 308]) test(`${code} POST navigation redirect sends original body once and zero forbidden requests`, async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await page.goto(`${servers.allowed}/form/${code}`);
  const failed = page.waitForEvent("requestfailed", request => request.url() === `${servers.allowed}/redirect/${code}`);
  await page.locator("form").evaluate(form => (form as HTMLFormElement).requestSubmit());
  await failed;
  expect(servers.hits.filter(hit => hit.method === "POST")).toEqual([{ method: "POST", path: `/redirect/${code}`, body: "probe=local-only" }]);
  expect(installed.blocked).toContainEqual({ url: `${servers.allowed}/redirect/${code}`, reason: "redirect", status: code });
  expect(servers.forbiddenHits).toEqual([]);
});

test("same-origin redirects are also rejected rather than starting an unguarded chain", async ({ page, context, servers }) => {
  await guard(context, servers);
  await expect(page.goto(`${servers.allowed}/same-origin-redirect`)).rejects.toThrow();
  expect(servers.hits.map(hit => hit.path)).toEqual(["/same-origin-redirect"]);
  expect(servers.forbiddenHits).toEqual([]);
});

test("fetch subresource redirect is blocked before destination contact", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await page.goto(`${servers.allowed}/ok`);
  expect(await page.evaluate(async url => {
    try { await fetch(url); return "unexpected success"; } catch { return "blocked"; }
  }, `${servers.allowed}/redirect/302`)).toBe("blocked");
  expect(installed.blocked.some(item => item.reason === "redirect")).toBe(true);
  expect(servers.forbiddenHits).toEqual([]);
});

test("real non-redirect HTTP error status and body remain unchanged", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  expect((await page.goto(`${servers.allowed}/error`))?.status()).toBe(502);
  await expect(page.locator("body")).toHaveText("real upstream error");
  expect(installed.blocked).toEqual([]);
  expect(servers.forbiddenHits).toEqual([]);
});

test("transport failure aborts without fallback or retry", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await page.goto(`${servers.allowed}/ok`);
  expect(await page.evaluate(async url => {
    try { await fetch(url, { method: "POST", body: "once" }); return "unexpected success"; } catch { return "blocked"; }
  }, `${servers.allowed}/broken`)).toBe("blocked");
  expect(installed.blocked).toContainEqual({ url: `${servers.allowed}/broken`, reason: "transport" });
  expect(servers.hits.filter(hit => hit.path === "/broken")).toEqual([{ method: "POST", path: "/broken", body: "once" }]);
  expect(servers.forbiddenHits).toEqual([]);
});

test("WebSocket cannot bypass the HTTP origin guard", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await page.goto(`${servers.allowed}/ok`);
  const url = servers.forbidden.replace("http:", "ws:") + "/socket";
  expect(await page.evaluate(url => new Promise<number>(resolve => {
    const socket = new WebSocket(url); socket.onclose = event => resolve(event.code);
  }), url)).toBe(1008);
  expect(installed.blocked).toContainEqual({ url, reason: "websocket" });
  expect(servers.forbiddenHits).toEqual([]);
});

// Evidence-only local reproduction of Playwright 1.60.0's old bypass. The
// "forbidden" endpoint is another loopback test server, never a live origin.
test("installed Playwright route.continue bypasses the initial-only guard on 302", async ({ page, context, servers }) => {
  const checked: string[] = [];
  await context.route("**/*", route => {
    const request = route.request(); checked.push(request.url());
    return browserRequestAllowed(servers.allowed, request.url(), request.method(), request.isNavigationRequest())
      ? route.continue() : route.abort("blockedbyclient");
  });
  const response = await page.goto(`${servers.allowed}/redirect/302`);
  expect(response?.url()).toBe(`${servers.forbidden}/destination`);
  expect(servers.forbiddenHits).toEqual([{ method: "GET", path: "/destination", body: "" }]);
  expect(checked).not.toContain(`${servers.forbidden}/destination`);
});

test("explicitly read-allowlisted external asset succeeds through the same guard", async ({ page, context, servers }) => {
  let reads = 0;
  const assetServer = createServer((_req, res) => {
    reads++;
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }); res.end("actual asset");
  });
  const assets = await listen(assetServer);
  try {
    const installed = await installStagingRequestGuard(context, { target: servers.allowed, origins: [servers.allowed, assets] });
    await page.goto(`${servers.allowed}/ok`);
    expect(await page.evaluate(async url => (await fetch(url)).text(), `${assets}/asset`)).toBe("actual asset");
    expect(reads).toBe(1);
    expect(installed.blocked).toEqual([]);
    expect(servers.forbiddenHits).toEqual([]);
  } finally {
    await new Promise<void>(resolve => { assetServer.close(() => resolve()); assetServer.closeAllConnections(); });
  }
});

test("local Blob downloads still work after installing the guard", async ({ page, context, servers }) => {
  const installed = await guard(context, servers);
  await page.goto(`${servers.allowed}/ok`);
  const pending = page.waitForEvent("download");
  await page.evaluate(() => {
    const url = URL.createObjectURL(new Blob(["local GPX download"], { type: "application/gpx+xml" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "guard-probe.gpx";
    document.body.append(anchor); anchor.click(); anchor.remove();
  });
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("local GPX download");
  expect(installed.blocked).toEqual([]);
  expect(servers.forbiddenHits).toEqual([]);
});
