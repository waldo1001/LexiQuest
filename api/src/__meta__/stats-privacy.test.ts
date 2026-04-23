/**
 * LexiQuest Invariant 2 (Design.md §5.8.5 / CLAUDE.md):
 *   Stats endpoints return aggregates only — never individual attempt
 *   rows of other users.
 *
 * Two enforcement layers:
 *
 * 1. Static scan: stats-* handler source files must not reference
 *    `AttemptRow` or attempt row fields (`response_time_ms`, `card_id`,
 *    `session_id`) inside a `jsonBody` or return context.  Aggregates
 *    (counts, sums, averages, dates) are fine.
 *
 * 2. Behavioural: call each stats endpoint as a *different* user and
 *    verify the response body contains no `rowKey` or `user_id` fields
 *    that would expose raw table rows.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsUserHandler } from "../functions/stats-user.js";
import { makeStatsCourseHandler } from "../functions/stats-course.js";
import { makeStatsFamilyHandler } from "../functions/stats-family.js";
import { makeStatsCompareHandler } from "../functions/stats-family.js";
import { makeStatsHeatmapHandler } from "../functions/stats-heatmap.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { AttemptRow } from "../functions/attempts-shared.js";
import type { SessionRow } from "../functions/sessions-shared.js";
import type { CourseRow } from "../functions/courses-shared.js";

const FUNCTIONS_DIR = join(__dirname, "..", "functions");
const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const TARGET_USER = "u-lex";
const CALLER_USER = "u-waldo";
const COURSE_ID = "course-1";

// ─── Layer 1: Static scan ──────────────────────────────────────────────────

describe("stats-privacy (LexiQuest invariant 2) — static", () => {
  it("stats-* handlers do not return raw rowKey fields in their response", () => {
    const statsFiles = readdirSync(FUNCTIONS_DIR).filter(
      (f) => f.startsWith("stats-") && f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    const offenders: string[] = [];

    for (const file of statsFiles) {
      const content = readFileSync(join(FUNCTIONS_DIR, file), "utf8");
      // Raw row fields that should never appear in a jsonBody return
      // These are Table Storage implementation details, not stats shapes
      if (/jsonBody.*rowKey/.test(content) || /rowKey.*jsonBody/.test(content)) {
        offenders.push(`${file}: exposes rawKey in jsonBody`);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `LexiQuest invariant 2 violated — stats endpoints must not expose raw table row keys:\n` +
          offenders.map((o) => `  ${o}`).join("\n"),
      );
    }
    expect(offenders).toHaveLength(0);
  });
});

// ─── Layer 2: Behavioural ──────────────────────────────────────────────────

function makeDeps() {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = CALLER_USER) {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedWorld(tables: FakeTableStorage) {
  const user: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: TARGET_USER,
    name: "Lex",
    password_hash: "secret-hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: {
      auto_speak: false,
      preferred_mode: "self_grade",
      daily_goal: 10,
      streak: 3,
      total_xp: 600,
      badges: [],
    },
    created_at: "2026-01-01T00:00:00.000Z",
  };
  tables.upsert("users", user);

  const callerUser: UserRow = { ...user, rowKey: CALLER_USER, name: "Waldo", is_admin: true };
  tables.upsert("users", callerUser);

  const course: CourseRow = {
    partitionKey: TARGET_USER,
    rowKey: COURSE_ID,
    user_id: TARGET_USER,
    year_id: "y-1",
    name: "French",
    emoji: "🇫🇷",
    color: "#000",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  tables.upsert("courses", course);

  const ts = "2026-04-20T09:05:00.000Z";
  const attempt: AttemptRow = {
    partitionKey: TARGET_USER,
    rowKey: `${ts}_a-1`,
    user_id: TARGET_USER,
    card_id: "card-1",
    session_id: "s-1",
    correct: true,
    mode: "self_grade",
    response_time_ms: 1500,
    timestamp: ts,
  };
  tables.upsert("attempts", attempt);

  const session: SessionRow = {
    partitionKey: TARGET_USER,
    rowKey: `${ts}_s-1`,
    user_id: TARGET_USER,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: ts,
    ended_at: ts,
    cards_studied: 5,
    cards_correct: 4,
    xp_earned: 70,
    duration_seconds: 300,
  };
  tables.upsert("sessions", session);
}

function makeGet(cookie: string | null, path: string, params: Record<string, string> = {}): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats${path}`,
    params,
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function hasRawRowField(body: unknown, fields: string[]): boolean {
  const json = JSON.stringify(body);
  return fields.some((f) => json.includes(`"${f}"`));
}

const RAW_ROW_FIELDS = ["rowKey", "partitionKey", "password_hash"];

describe("stats-privacy (LexiQuest invariant 2) — behavioural", () => {
  it("stats/user does not leak raw row fields when caller is different user", async () => {
    const deps = makeDeps();
    seedWorld(deps.tables);
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeGet(validCookie(deps), `/user/${TARGET_USER}`, { userId: TARGET_USER }), ctx);
    expect(res.status).toBe(200);
    expect(hasRawRowField(res.jsonBody, RAW_ROW_FIELDS)).toBe(false);
  });

  it("stats/course does not leak raw row fields", async () => {
    const deps = makeDeps();
    seedWorld(deps.tables);
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeGet(validCookie(deps), `/course/${COURSE_ID}`, { courseId: COURSE_ID }), ctx);
    expect(res.status).toBe(200);
    expect(hasRawRowField(res.jsonBody, RAW_ROW_FIELDS)).toBe(false);
  });

  it("stats/family does not leak raw row fields", async () => {
    const deps = makeDeps();
    seedWorld(deps.tables);
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeGet(validCookie(deps), "/family"), ctx);
    expect(res.status).toBe(200);
    expect(hasRawRowField(res.jsonBody, RAW_ROW_FIELDS)).toBe(false);
  });

  it("stats/compare does not leak raw row fields", async () => {
    const deps = makeDeps();
    seedWorld(deps.tables);
    const handler = makeStatsCompareHandler(deps);
    const req = {
      ...makeGet(validCookie(deps), "/compare"),
      query: { get: (k: string) => ({ userIds: TARGET_USER, metric: "xp" }[k] ?? null) },
    } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(200);
    expect(hasRawRowField(res.jsonBody, RAW_ROW_FIELDS)).toBe(false);
  });

  it("stats/heatmap does not leak raw row fields", async () => {
    const deps = makeDeps();
    seedWorld(deps.tables);
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeGet(validCookie(deps), `/heatmap/${TARGET_USER}`, { userId: TARGET_USER }), ctx);
    expect(res.status).toBe(200);
    expect(hasRawRowField(res.jsonBody, RAW_ROW_FIELDS)).toBe(false);
  });
});
