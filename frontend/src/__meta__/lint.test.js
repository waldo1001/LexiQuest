/**
 * Meta-test: `eslint .` is part of `npm test`, so a lint error fails the suite (and therefore
 * the League's gate) with ESLint's own output quoted. Warnings do not fail (exit 0).
 * Spec: docs/specs/3-typecheck-and-lint-green.md (AC2, AC12).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ESLINT = join(FRONTEND, "node_modules/.bin/eslint");

describe("lint", () => {
  it("lint: eslint . reports no errors", { timeout: 60_000 }, () => {
    let output = "";
    try {
      execFileSync(ESLINT, ["."], {
        cwd: FRONTEND,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      if (!output) output = String(err);
    }
    const head = output.split("\n").slice(0, 40).join("\n");
    expect(head, `eslint . failed:\n${head}`).toBe("");
  });
});
