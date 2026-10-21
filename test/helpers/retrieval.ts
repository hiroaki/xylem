import { vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const shareId = "01234567-0123-4123-8123-0123456789ab";
export const canonical = () => ({schema_version: 1, data_type: "gpx", data: {
  tracks: [], routes: [], waypoints: [{coordinates: [139, 35], name: "Sample"}],
}});
export async function setupRetrieval(options: {apiUrl?: string; env?: Record<string, string>} = {}) {
  vi.resetModules();
  const cache = await mkdtemp(join(tmpdir(), "xylem-b4-"));
  for (const [key, value] of Object.entries({
    ANEMOCHORE_API_URL: options.apiUrl ?? "https://storage.example", ANEMOCHORE_API_KEY: "PRIVATE_KEY",
    XYLEM_PUBLIC_ORIGIN: "https://gpx.example", XYLEM_DELETE_SECRET: "PRIVATE_SECRET",
    CHLOROPLAST_PUBLIC_ORIGIN: "https://og.example", SHARE_CACHE_DIR: cache, LOG_LEVEL: "info",
    GPX_MAX_ROUTES: "20", GPX_MAX_ROUTE_POINTS_PER_ROUTE: "100",
    XYLEM_GPX_MAX_RAW_BYTES: "2097152", XYLEM_GPX_MAX_TOTAL_POINTS: "50000",
    ...options.env,
  })) vi.stubEnv(key, value);
  const logs: any[] = [];
  const record = (obj: unknown) => logs.push(obj);
  vi.spyOn(console, "error").mockImplementation((...args) => logs.push(args));
  const { setRootLoggerForTesting } = await import("../../src/logging/root-logger.js");
  setRootLoggerForTesting({info: record, error: record, warn: record, debug: record});
  const fetchMock = vi.fn(async (_url?: unknown, _init?: RequestInit): Promise<Response> => new Response(JSON.stringify(canonical())));
  vi.stubGlobal("fetch", fetchMock);
  const app = (await import("../../src/app.js")).createApp();
  return { app, cache, logs, fetchMock, async cleanup() {
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await rm(cache, {recursive: true, force: true});
  }};
}
