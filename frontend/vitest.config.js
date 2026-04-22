import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Drop-in Vitest config for LexiQuest's frontend/ project.
// Policy reference: ../docs/tdd/coverage-policy.md (two-tier).
//
// Tier A (90% per file): src/lib/**
// Tier B (70% per file, branches reported but not enforced): src/screens/**,
//   src/components/**, src/charts/**
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
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
        "src/main.jsx",
        "vite.config.js",
        "vitest.config.js",
        "src/testing/**",
        "src/**/__fixtures__/**",
        "src/**/*.test.{js,jsx}",
      ],
      thresholds: {
        perFile: true,
        lines: 70,
        functions: 70,
        statements: 70,
        "src/lib/swaConfig.js": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
