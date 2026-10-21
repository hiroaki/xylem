import { describe, expect, it } from "vitest";
import { assertRunResource, browserRequestAllowed, stagingTarget, stagingPolicy, WRITE_OPT_IN } from "./safety.js";

const target = "https://staging.gpx.localdomain";
const valid = { GPX_STAGING_BASE_URL: target, GPX_STAGING_ALLOWLIST_FILE: "/operator/allowlist.json", GPX_STAGING_WRITE_OPT_IN: WRITE_OPT_IN };
const read = () => JSON.stringify({ origins: [target] });
describe("offline staging safety checks", () => {
  it("accepts only explicit operator-approved inputs", () => expect(stagingTarget(valid, read)).toBe(target));
  it.each([undefined, "", "yes"])("rejects missing or wrong write opt-in %s", value => {
    expect(() => stagingTarget({ ...valid, GPX_STAGING_WRITE_OPT_IN: value }, read)).toThrow("opt-in");
  });
  it.each([undefined, "", "http://staging.gpx.localdomain", target + "/", target + "/path", target + "?x=1", target + "#x", "https://user:secret@staging.gpx.localdomain", "not a URL"])("rejects unsafe origin %s", value => {
    expect(() => stagingTarget({ ...valid, GPX_STAGING_BASE_URL: value }, read)).toThrow();
  });
  it.each(["https://gpx.hwat.jp", "https://gpx.hwat.jp.", "https://gpx.hwat.jp:443", "https://gpx-ogp.hwat.jp", "https://anemochore.frosty-feather-603c.workers.dev"])("rejects production even when allowlisted: %s", value => {
    expect(() => stagingTarget({ ...valid, GPX_STAGING_BASE_URL: value }, () => JSON.stringify({ origins: [value] }))).toThrow();
  });
  it("rejects missing allowlist file", () => expect(() => stagingTarget({ ...valid, GPX_STAGING_ALLOWLIST_FILE: undefined }, read)).toThrow("allowlist"));
  it("rejects unreadable allowlist", () => expect(() => stagingTarget(valid, () => { throw new Error("ENOENT"); })).toThrow("Cannot read"));
  it.each(["bad JSON", "null", "[]", '{}', '{"origins":[]}', '{"origins":["*"]}', '{"origins":["https://staging.gpx.localdomain.evil"]}', '{"origins":["https://elsewhere.test"]}', '{"origins":["https://staging.gpx.localdomain"],"fallback":true}'])("rejects invalid/unmatched allowlist %s", value => {
    expect(() => stagingTarget(valid, () => value)).toThrow();
  });
  const id = "12345678-1234-4123-8123-123456789abc";
  it("allows cleanup only for a created UUID", () => expect(() => assertRunResource(id, new Set([id]))).not.toThrow());
  it("rejects unrelated UUID cleanup", () => expect(() => assertRunResource(id, new Set())).toThrow());
  it("rejects unsafe cleanup paths even if recorded", () => expect(() => assertRunResource("../other", new Set(["../other"]))).toThrow());
});

describe("staging browser egress guard", () => {
  it("allows same-origin application POST", () => expect(browserRequestAllowed(target, target + "/api/upload", "POST", false)).toBe(true));
  it("allows external CDN GET without response replacement", () => expect(browserRequestAllowed(target, "https://unpkg.com/leaflet.js", "GET", false, [target, "https://unpkg.com"])).toBe(true));
  it.each(["POST", "PUT", "DELETE", "PATCH"])("blocks external state change %s", method => expect(browserRequestAllowed(target, "https://elsewhere.test/api/upload", method, false, [target, "https://elsewhere.test"])).toBe(false));
  it("blocks navigation redirects off the target", () => expect(browserRequestAllowed(target, "https://elsewhere.test/", "GET", true)).toBe(false));
  it.each(["https://gpx.hwat.jp/", "https://gpx.hwat.jp./"])("blocks even read-only access to known production %s", value => expect(browserRequestAllowed(target, value, "GET", false)).toBe(false));
});


describe("explicit external origin allowlist", () => {
  it("retains all operator-approved origins for request enforcement", () => {
    expect(stagingPolicy(valid, () => JSON.stringify({ origins: [target, "https://unpkg.com"] })))
      .toEqual({ target, origins: [target, "https://unpkg.com"] });
  });
  it("rejects unlisted external reads", () => expect(browserRequestAllowed(target, "https://unpkg.com/leaflet.js", "GET", false)).toBe(false));
  it("does not permit external navigation even when read-allowlisted", () => expect(browserRequestAllowed(target, "https://unpkg.com/", "GET", true, [target, "https://unpkg.com"])).toBe(false));
});

it("rejects a production asset origin even when the staging target itself is valid", () => {
  expect(() => stagingPolicy(valid, () => JSON.stringify({ origins: [target, "https://gpx.hwat.jp"] }))).toThrow("Production");
});
