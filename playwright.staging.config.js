import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { stagingTarget } from "./test/staging/safety.js";

export default defineConfig({
  testDir: "./test/staging",
  testMatch: "acceptance.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: "list",
  outputDir: `test-results/staging/${randomUUID()}`,
  use: {
    baseURL: stagingTarget(),
    browserName: "chromium",
    ignoreHTTPSErrors: false,
    serviceWorkers: "block",
    // Avoid additional fetches by trace snapshots and storage of capability tokens.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  // HTTP guard installed before navigation: no automatic redirects or unlisted origins.
  // No webServer, storageState, API credentials or local application replacement.
});
