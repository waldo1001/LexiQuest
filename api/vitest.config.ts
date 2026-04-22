import { defineConfig } from "vitest/config";

// Policy reference: ../docs/tdd/coverage-policy.md (Tier A — 90% per file).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "**/*.test.ts",
      "**/__integration__/**/*.test.ts",
      "**/__contract__/**/*.test.ts",
      "**/__meta__/**/*.test.ts",
    ],
    exclude: ["node_modules/**", "dist/**"],
    allowOnly: !process.env.CI,
    testTimeout: 5_000,
    hookTimeout: 5_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/shared/config.ts",
        "**/*.d.ts",
        "src/testing/**",
        "**/__fixtures__/**",
        "**/*.test.ts",
        "**/__integration__/**",
        "**/__contract__/**",
        "**/__meta__/**",
        "vitest.config.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
