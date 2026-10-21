import { defineConfig } from "@playwright/test";

// Only controlled loopback HTTP servers; no staging configuration or live access.
export default defineConfig({
  testDir: "./test/staging",
  testMatch: "redirect-guard.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 15_000,
  reporter: "list",
  outputDir: "test-results/staging-safety",
  use: { browserName: "chromium", serviceWorkers: "block", trace: "off" },
});
