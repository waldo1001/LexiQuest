/**
 * LexiQuest Phase 9 — row-key format invariant.
 *
 * attempts and sessions use rowKey = "{ISO_timestamp}_{uuid}" so that
 * Azure Table Storage range queries (`listByRowKeyRange`) return rows in
 * chronological order and date-range stats queries work correctly.
 *
 * This test suite:
 *  1. Unit-tests the helper functions themselves.
 *  2. Scans production source to ensure no handler builds row keys inline.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { makeAttemptRowKey } from "../functions/attempts-shared.js";
import { makeSessionRowKey } from "../functions/sessions-shared.js";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ---------------------------------------------------------------------------
// Unit tests for the helper functions
// ---------------------------------------------------------------------------

describe("makeAttemptRowKey", () => {
  it("returns <timestamp>_<id>", () => {
    const ts = "2026-04-22T10:00:00.000Z";
    const id = "abc-123";
    expect(makeAttemptRowKey(ts, id)).toBe(`${ts}_${id}`);
  });

  it("prefix is a valid ISO timestamp string", () => {
    const ts = new Date().toISOString();
    const key = makeAttemptRowKey(ts, "uuid");
    const prefix = key.slice(0, ts.length);
    expect(ISO_RE.test(prefix)).toBe(true);
  });

  it("lexicographic order mirrors chronological order", () => {
    const earlier = makeAttemptRowKey("2026-01-01T00:00:00.000Z", "aaa");
    const later   = makeAttemptRowKey("2026-06-01T00:00:00.000Z", "bbb");
    expect(earlier < later).toBe(true);
  });
});

describe("makeSessionRowKey", () => {
  it("returns <startedAt>_<id>", () => {
    const ts = "2026-04-22T10:00:00.000Z";
    const id = "session-uuid";
    expect(makeSessionRowKey(ts, id)).toBe(`${ts}_${id}`);
  });

  it("prefix is a valid ISO timestamp string", () => {
    const ts = new Date().toISOString();
    const key = makeSessionRowKey(ts, "uuid");
    const prefix = key.slice(0, ts.length);
    expect(ISO_RE.test(prefix)).toBe(true);
  });

  it("lexicographic order mirrors chronological order", () => {
    const earlier = makeSessionRowKey("2026-01-01T00:00:00.000Z", "aaa");
    const later   = makeSessionRowKey("2026-06-01T00:00:00.000Z", "bbb");
    expect(earlier < later).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Code-scanning: no inline rowKey construction for attempts / sessions
// ---------------------------------------------------------------------------

const FUNCTIONS_DIR = join(__dirname, "..", "functions");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkTs(full));
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Pattern: assigning rowKey with a template literal that contains a direct
// timestamp + underscore + id construction (not via the helper functions).
// We look for `rowKey:` followed by a template literal or string concat that
// doesn't call a makeXxxRowKey helper.
const INLINE_ROWKEY_RE = /rowKey\s*:\s*`[^`]*_[^`]*`(?!\s*\/\*\s*via\s*make)/;

describe("row-key-format (code scan)", () => {
  it("production handlers use makeAttemptRowKey / makeSessionRowKey, not inline templates", () => {
    const files = walkTs(FUNCTIONS_DIR);
    // Exempt: the shared files that DEFINE the helpers — they are allowed to
    // have inline implementations.
    const EXEMPT = new Set([
      "attempts-shared.ts",
      "sessions-shared.ts",
    ]);

    const offenders: { file: string; line: number; text: string }[] = [];
    for (const file of files) {
      const basename = file.split("/").pop()!;
      if (EXEMPT.has(basename)) continue;

      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (INLINE_ROWKEY_RE.test(line)) {
          offenders.push({ file, line: i + 1, text: line.trim() });
        }
      });
    }

    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
        .join("\n");
      throw new Error(
        `Row-key format invariant violated — use makeAttemptRowKey / makeSessionRowKey:\n${report}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
