import { readFileSync } from "node:fs";

export const WRITE_OPT_IN = "I_UNDERSTAND_THIS_WRITES_STAGING_KV";
const productionHosts = new Set([
  "gpx.hwat.jp", "gpx-ogp.hwat.jp", "anemochore.frosty-feather-603c.workers.dev",
]);

function origin(value) {
  if (typeof value !== "string") throw new Error("Expected an explicit HTTPS origin");
  let url;
  try { url = new URL(value); } catch { throw new Error("Expected an explicit HTTPS origin"); }
  if (url.protocol !== "https:" || value !== url.origin || url.username || url.password) {
    throw new Error("Use a canonical HTTPS origin without path, credentials, query or fragment");
  }
  if (productionHosts.has(url.hostname.replace(/\.$/, ""))) throw new Error("Production targets are forbidden");
  return url.origin;
}

// The operator-controlled file is the trust boundary: no hostname substring
// heuristic, default target, secrets, environment discovery or live lookup.
export function stagingPolicy(env = process.env, read = path => readFileSync(path, "utf8")) {
  if (env.GPX_STAGING_WRITE_OPT_IN !== WRITE_OPT_IN) throw new Error("Explicit staging write opt-in is required");
  const target = origin(env.GPX_STAGING_BASE_URL);
  if (!env.GPX_STAGING_ALLOWLIST_FILE) throw new Error("Explicit staging allowlist file is required");
  let allowed;
  try { allowed = JSON.parse(read(env.GPX_STAGING_ALLOWLIST_FILE)); }
  catch { throw new Error("Cannot read staging allowlist JSON"); }
  if (!allowed || Object.keys(allowed).length !== 1 || !Array.isArray(allowed.origins) || !allowed.origins.length) {
    throw new Error("Allowlist must contain only a nonempty origins array");
  }
  const origins = allowed.origins.map(origin);
  if (!origins.includes(target)) throw new Error("Staging origin is not explicitly allowlisted");
  return { target, origins };
}

export function stagingTarget(env = process.env, read = path => readFileSync(path, "utf8")) {
  return stagingPolicy(env, read).target;
}

export function assertRunResource(id, created) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || !created.has(id)) throw new Error("Refusing cleanup of a resource not created by this test");
}

export function browserRequestAllowed(target, href, method, navigation, allowedOrigins = [target]) {
  const url = new URL(href);
  if (!["http:", "https:"].includes(url.protocol) || !allowedOrigins.includes(url.origin)
      || productionHosts.has(url.hostname.replace(/\.$/, ""))) return false;
  return url.origin === target || (!navigation && ["GET", "HEAD", "OPTIONS"].includes(method));
}
