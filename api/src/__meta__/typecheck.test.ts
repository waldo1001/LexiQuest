/**
 * Meta-test: `tsc -p tsconfig.test.json` is part of `npm test`, so a type error in a test file
 * fails the suite (and therefore the League's gate) with tsc's own output quoted.
 * Spec: docs/specs/3-typecheck-and-lint-green.md (AC1).
 */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const API = resolve(__dirname, "../..");
const TSC = join(API, "node_modules/.bin/tsc");

describe("typecheck", () => {
  it("typecheck: tsc -p tsconfig.test.json reports no errors", { timeout: 60_000 }, () => {
    let output = "";
    try {
      execFileSync(TSC, ["-p", "tsconfig.test.json"], {
        cwd: API,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ""}${e.stderr ?? ""}` || String(err);
    }
    const head = output.split("\n").slice(0, 20).join("\n");
    expect(head, `tsc reported errors:\n${head}`).toBe("");
  });
});
