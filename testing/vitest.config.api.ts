import { defineConfig } from "vitest/config";

// Drop-in Vitest config for LexiQuest's api/ project.
// Policy reference: ../docs/tdd/coverage-policy.md (Tier A — 90% per file)
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
    // Fail fast on .only in CI — no one should ever commit focus-mode tests.
    allowOnly: !process.env.CI,
    // Tests must be fast. See methodology §6.
    testTimeout: 5_000,
    hookTimeout: 5_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["**/*.ts"],
      exclude: [
        // Composition roots — integration-tested via /local-smoke.
        "*/index.ts",
        "shared/config.ts",
        // Type-only files.
        "**/*.d.ts",
        // Test doubles themselves (covered by their contract tests).
        "testing/**",
        // Static fixtures.
        "**/__fixtures__/**",
        // Tests don't count toward production coverage.
        "**/*.test.ts",
        "**/__integration__/**",
        "**/__contract__/**",
        "**/__meta__/**",
        // Vitest config itself.
        "vitest.config.ts",
      ],
      // Per-file thresholds — Tier A.
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
