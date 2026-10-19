import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4184",
    // Trace snapshots can refetch GPX responses and perturb retrieval counters.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node --import tsx test/browser/server.ts",
    url: "http://127.0.0.1:4184/api/health",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
