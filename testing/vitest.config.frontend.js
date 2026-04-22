import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Drop-in Vitest config for LexiQuest's frontend/ project.
// Policy reference: ../docs/tdd/coverage-policy.md (two-tier).
//
// Tier A (90% per file): src/lib/**
// Tier B (70% per file, branches reported but not enforced): src/screens/**,
//   src/components/**, src/charts/**
//
// Vitest v2 does not support per-glob thresholds out of the box, so this
// config enforces a *single* floor (the Tier B floor) globally and relies
// on a per-file override pattern via the `100 - 0 scoring` trick:
// each Tier A file has a matching perFileThresholds entry. Add entries as
// new files under src/lib/ are created — see the example at the bottom.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    allowOnly: !process.env.CI,
    testTimeout: 5_000,
    hookTimeout: 5_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        // Composition root.
        "src/main.jsx",
        // Config files.
        "vite.config.js",
        "vitest.config.js",
        // Test doubles themselves.
        "src/testing/**",
        // Static fixtures.
        "src/**/__fixtures__/**",
        // Tests.
        "src/**/*.test.{js,jsx}",
      ],
      // Tier B global floor (per file).
      thresholds: {
        perFile: true,
        lines: 70,
        functions: 70,
        statements: 70,
        // Tier A overrides — add one entry per file under src/lib/**.
        // When a new pure-logic module is created, add it here.
        // Example (uncomment once the files exist in Phase 8+):
        //
        // "src/lib/sm2.js": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // "src/lib/xp.js": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // "src/lib/api.js": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // "src/lib/tts.js": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // "src/lib/random.js": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
