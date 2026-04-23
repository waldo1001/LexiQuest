import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsCourseHandler, type StatsCourseDeps } from "./stats-course.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { SessionRow } from "./sessions-shared.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { AttemptRow } from "./attempts-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-1";

function makeReq(cookie: string | null, courseId: string, range?: string): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats/course/${courseId}`,
    params: { courseId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => (k === "range" ? (range ?? null) : null) },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsCourseDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>) {
  const token = deps.signer.sign({ userId: USER_ID, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage): UserRow {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: USER_ID,
    name: "Lex",
    password_hash: "hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
    created_at: "2026-01-01T00:00:00.000Z",
  };
  tables.upsert("users", row);
  return row;
}

function seedCourse(tables: FakeTableStorage, userId = USER_ID): CourseRow {
  const row: CourseRow = {
    partitionKey: userId,
    rowKey: COURSE_ID,
    user_id: userId,
    year_id: "y-1",
    name: "French",
    emoji: "🇫🇷",
    color: "#000",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  tables.upsert("courses", row);
  return row;
}

function seedSession(tables: FakeTableStorage, overrides: Partial<SessionRow> = {}): SessionRow {
  const started = overrides.started_at ?? "2026-04-20T09:00:00.000Z";
  const row: SessionRow = {
    partitionKey: overrides.partitionKey ?? USER_ID,
    rowKey: `${started}_s-1`,
    user_id: USER_ID,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: started,
    ended_at: started,
    cards_studied: 10,
    cards_correct: 8,
    xp_earned: 100,
    duration_seconds: 300,
    ...overrides,
  };
  tables.upsert("sessions", row);
  return row;
}

function seedAttempt(tables: FakeTableStorage, overrides: Partial<AttemptRow> = {}): AttemptRow {
  const ts = overrides.timestamp ?? "2026-04-20T09:05:00.000Z";
  const row: AttemptRow = {
    partitionKey: overrides.partitionKey ?? USER_ID,
    rowKey: overrides.rowKey ?? `${ts}_a-1`,
    user_id: USER_ID,
    card_id: overrides.card_id ?? "card-1",
    session_id: "s-1",
    correct: overrides.correct ?? true,
    mode: "self_grade",
    response_time_ms: 2000,
    timestamp: ts,
    ...overrides,
  };
  tables.upsert("attempts", row);
  return row;
}

function seedCard(tables: FakeTableStorage, overrides: Partial<CardRow> & { rowKey: string } = { rowKey: "card-1" }): CardRow {
  const row: CardRow = {
    partitionKey: COURSE_ID,
    rowKey: overrides.rowKey,
    course_id: COURSE_ID,
    question: `Q-${overrides.rowKey}?`,
    answer: "A",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-23T12:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  tables.upsert("cards", row);
  return row;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/stats/course/:courseId", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(null, COURSE_ID), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    const handler = makeStatsCourseHandler(deps);
    const req = { ...makeReq(validCookie(deps), COURSE_ID), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("returns 404 when course not found", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "no-such-course"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns correct shape with empty arrays for course with no data", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.sessionsPerDay).toEqual([]);
    expect(body.accuracyTrend).toEqual([]);
    expect(body.masteryDistribution).toEqual({ new: 0, learning: 0, young: 0, mature: 0, mastered: 0 });
    expect(body.cardStruggleList).toEqual([]);
  });

  it("returns cardStruggleList: top 20 cards by fail count", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, { rowKey: "card-1", question: "What is 1+1?" });
    seedCard(deps.tables, { rowKey: "card-2", question: "Capital of France?" });

    // card-1: 3 fails, card-2: 1 fail
    const ts = "2026-04-20T09:05:00.000Z";
    seedAttempt(deps.tables, { card_id: "card-1", correct: false, timestamp: ts, rowKey: `${ts}_a1` });
    seedAttempt(deps.tables, { card_id: "card-1", correct: false, timestamp: ts, rowKey: `${ts}_a2` });
    seedAttempt(deps.tables, { card_id: "card-1", correct: false, timestamp: ts, rowKey: `${ts}_a3` });
    seedAttempt(deps.tables, { card_id: "card-2", correct: false, timestamp: ts, rowKey: `${ts}_a4` });
    seedAttempt(deps.tables, { card_id: "card-2", correct: true,  timestamp: ts, rowKey: `${ts}_a5` });

    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const list = body.cardStruggleList as { cardId: string; question: string; failCount: number }[];
    expect(list[0].cardId).toBe("card-1");
    expect(list[0].failCount).toBe(3);
    expect(list[1].cardId).toBe("card-2");
    expect(list[1].failCount).toBe(1);
  });

  it("cardStruggleList limits to top 20", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    // Seed 25 cards each with 1 fail
    for (let i = 1; i <= 25; i++) {
      const id = `card-${String(i).padStart(3, "0")}`;
      const ts = `2026-04-20T09:${String(i).padStart(2, "0")}:00.000Z`;
      seedCard(deps.tables, { rowKey: id, question: `Q${i}?` });
      seedAttempt(deps.tables, { card_id: id, correct: false, timestamp: ts, rowKey: `${ts}_a` });
    }
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const list = body.cardStruggleList as unknown[];
    expect(list.length).toBeLessThanOrEqual(20);
  });

  it("returns Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    expect((res.headers as Record<string, string>)["Cache-Control"]).toBe("private, max-age=60");
  });

  it("finds course across all user partitions (family visibility)", async () => {
    const deps = makeDeps();
    // Seed caller user
    seedUser(deps.tables);
    // Seed another user and their course
    const otherUser: UserRow = {
      partitionKey: PARTITIONS.users,
      rowKey: "u-mats",
      name: "Mats",
      password_hash: "hash",
      is_admin: false,
      color: "#dc2626",
      avatar_emoji: "🐻",
      ui_language: "en",
      settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
      created_at: "2026-01-01T00:00:00.000Z",
    };
    deps.tables.upsert("users", otherUser);
    const otherCourse: CourseRow = {
      partitionKey: "u-mats",
      rowKey: "course-mats",
      user_id: "u-mats",
      year_id: "y-1",
      name: "Math",
      emoji: "📐",
      color: "#f00",
      language: null,
      default_mode: "self_grade",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    deps.tables.upsert("courses", otherCourse);

    const handler = makeStatsCourseHandler(deps);
    // Logged in as USER_ID but requesting Mats's course
    const res = await handler(makeReq(validCookie(deps), "course-mats"), ctx);
    expect(res.status).toBe(200);
  });

  it("returns sessionsPerDay filtered to the course", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedSession(deps.tables, { started_at: "2026-04-20T09:00:00.000Z", course_id: COURSE_ID });
    const handler = makeStatsCourseHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const spd = body.sessionsPerDay as { date: string; count: number }[];
    expect(spd.find((s) => s.date === "2026-04-20")).toBeDefined();
  });
});
