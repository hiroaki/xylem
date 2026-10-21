import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Cross-repository tests have a separate, explicit command and required inputs.
    exclude: [...configDefaults.exclude, "test/integration/**"],
  },
});
