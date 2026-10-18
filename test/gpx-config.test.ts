import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../src/config.js";

beforeEach(() => {
  const required = {
    ANEMOCHORE_API_URL: "https://storage.example",
    ANEMOCHORE_API_KEY: "test",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example",
    XYLEM_DELETE_SECRET: "test",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example",
  };
  for (const [name, value] of Object.entries(required)) vi.stubEnv(name, value);
  vi.stubEnv("GPX_MAX_ROUTES", undefined);
  vi.stubEnv("GPX_MAX_ROUTE_POINTS_PER_ROUTE", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("D14 startup configuration (L04)", () => {
  it.each(["", "1", "200", "999999", "not-a-number"])("ignores retired name-length environment setting %s", raw => {
    vi.stubEnv("XYLEM_GPX_MAX_NAME_LENGTH", raw);
    expect(getConfig().gpxPolicy).toEqual({maxRawBytes: 2097152, maxTotalPoints: 50000, maxRoutes: 20, maxRoutePointsPerRoute: 100});
    expect(getConfig().gpxPolicy).not.toHaveProperty("maxNameLength");
  });
  it("uses local defaults when unset", () => {
    expect(getConfig().gpxPolicy).toMatchObject({ maxRoutes: 20, maxRoutePointsPerRoute: 100 });
  });
  const settings = [
    ["GPX_MAX_ROUTES", "maxRoutes", 20],
    ["GPX_MAX_ROUTE_POINTS_PER_ROUTE", "maxRoutePointsPerRoute", 100],
  ] as const;
  for (const [name, key, ceiling] of settings) {
    it.each(["1", String(ceiling)])(`${name} accepts %s independently`, raw => {
      vi.stubEnv(name, raw);
      expect(getConfig().gpxPolicy[key]).toBe(Number(raw));
    });
    const invalid = [
      "", " ", " 1", "+1", "１", "0", "-1", "1.5", "1.0", "0x10", "1e1",
      "NaN", "Infinity", "1junk", "9007199254740993", String(ceiling + 1),
    ];
    it.each(invalid)(`${name} rejects %s`, raw => {
      vi.stubEnv(name, raw);
      expect(() => getConfig()).toThrow(name);
    });
  }
  it.each(settings)("rejects %s before the actual server starts", name => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: { ...process.env, [name]: "0" },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(result.stdout).not.toContain("server starting");
  });
});
