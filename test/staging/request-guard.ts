import type { APIResponse, BrowserContext } from "@playwright/test";
import { browserRequestAllowed } from "./safety.js";

type Policy = { target: string; origins: string[] };
type Blocked = { url: string; reason: "origin" | "redirect" | "transport" | "websocket"; status?: number };

// BrowserContext routing covers this context's pages/subresources. Do not use
// route.continue(): Playwright 1.60.0 bypasses route handlers on redirected hops.
// Instead issue exactly one real HTTP request, return its unchanged response,
// and reject ALL 3xx before Chromium can see a Location (even allowlisted hops).
export async function installStagingRequestGuard(context: BrowserContext, policy: Policy) {
  const blocked: Blocked[] = [];
  // The suite has no WebSocket feature; never open a server connection via a
  // transport that BrowserContext.route does not intercept.
  await context.routeWebSocket("**/*", socket => {
    blocked.push({ url: socket.url(), reason: "websocket" });
    socket.close({ code: 1008, reason: "Staging acceptance forbids WebSockets" });
  });
  await context.route("**/*", async route => {
    const request = route.request();
    let response: APIResponse | undefined;
    try {
      if (!browserRequestAllowed(policy.target, request.url(), request.method(), request.isNavigationRequest(), policy.origins)) {
        blocked.push({ url: request.url(), reason: "origin" });
        await route.abort("blockedbyclient");
        return;
      }
      response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      if (response.status() >= 300 && response.status() < 400) {
        blocked.push({ url: request.url(), reason: "redirect", status: response.status() });
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({ response }); // real response, no mocks/body/module edits
    } catch {
      // A failed request or closed page must never fall back to an unguarded send.
      blocked.push({ url: request.url(), reason: "transport" });
      await route.abort("failed").catch(() => {});
    } finally {
      await response?.dispose().catch(() => {});
    }
  });
  return { blocked };
}
