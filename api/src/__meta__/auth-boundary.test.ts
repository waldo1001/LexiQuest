/**
 * LexiQuest Invariant 1 (Design.md §4 / CLAUDE.md):
 *   user_id is derived from the session, never from the request body.
 *
 * This meta-test walks api/src/functions/ and fails if any production
 * file reads `req.body.userId` or `body.userId`. Test files are
 * excluded so a test asserting "reject body.userId" doesn't
 * self-trigger the meta-test.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS_DIR = join(__dirname, "..", "functions");

// login is the one legitimate exception: it has no session yet, so
// the body IS the source of truth for the userId being authenticated.
const EXEMPT = new Set(["login.ts"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (
      full.endsWith(".ts") &&
      !full.endsWith(".test.ts") &&
      !EXEMPT.has(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

const BANNED = /\b(?:req\.body|body)\.userId\b/;

describe("auth-boundary (LexiQuest invariant 1)", () => {
  it("no production handler reads userId from the request body", () => {
    const files = walk(FUNCTIONS_DIR);
    const offenders: { file: string; line: number; text: string }[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BANNED.test(line)) {
          offenders.push({ file, line: i + 1, text: line.trim() });
        }
      });
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
        .join("\n");
      throw new Error(
        `LexiQuest invariant 1 violated — userId must come from the session, not the body:\n${report}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
