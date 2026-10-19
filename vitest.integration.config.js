import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/phase-b-contract.test.ts"],
    // Missing inputs or a missing test file must fail, never pass as a skip.
    passWithNoTests: false,
  },
});
