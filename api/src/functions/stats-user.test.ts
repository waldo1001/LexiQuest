import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsUserHandler, type StatsUserDeps } from "./stats-user.js";
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
const CALLER_ID = "u-waldo";
const COURSE_ID = "course-1";

function makeReq(cookie: string | null, userId: string, range?: string): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats/user/${userId}`,
    params: { userId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => (k === "range" ? (range ?? null) : null) },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsUserDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = CALLER_ID) {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage, overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: USER_ID,
    name: "Lex",
    password_hash: "hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: {
      auto_speak: false,
      preferred_mode: "self_grade",
      daily_goal: 10,
      streak: 5,
      last_session_date: "2026-04-22",
      freeze_tokens: 0,
      total_xp: 1200,
      badges: ["on_fire"],
    },
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  tables.upsert("users", row);
  return row;
}

function seedSession(tables: FakeTableStorage, overrides: Partial<SessionRow> = {}): SessionRow {
  const started = overrides.started_at ?? "2026-04-20T09:00:00.000Z";
  const row: SessionRow = {
    partitionKey: USER_ID,
    rowKey: `${started}_s-1`,
    user_id: USER_ID,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: started,
    ended_at: overrides.ended_at ?? started,
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
    partitionKey: USER_ID,
    rowKey: `${ts}_a-1`,
    user_id: USER_ID,
    card_id: "card-1",
    session_id: "s-1",
    correct: true,
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
    question: "Q?",
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

function seedCourse(tables: FakeTableStorage): CourseRow {
  const row: CourseRow = {
    partitionKey: USER_ID,
    rowKey: COURSE_ID,
    user_id: USER_ID,
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

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/stats/user/:userId", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(null, USER_ID), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-GET method", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsUserHandler(deps);
    const req = { ...makeReq(validCookie(deps), USER_ID), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("returns 404 for unknown userId", async () => {
    const deps = makeDeps();
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "u-nobody"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns correct shape with zeroed totals for user with no sessions", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, {
      rowKey: USER_ID,
      settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10,
        streak: 0, total_xp: 0, badges: [] },
    });
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.totalXp).toBe(0);
    expect(body.level).toBe(0);
    expect(body.currentStreak).toBe(0);
    expect(body.totalSessions).toBe(0);
    expect(body.totalCardsStudied).toBe(0);
    expect(body.totalMinutes).toBe(0);
    expect(body.accuracyTrend).toEqual([]);
    expect(body.dailyXp).toEqual([]);
    expect(body.sessionsPerDay).toEqual([]);
  });

  it("returns totalXp and level from user settings", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.totalXp).toBe(1200);
    expect(body.level).toBe(6); // floor(1200 / 200)
    expect(body.currentStreak).toBe(5);
    expect(body.badgesEarned).toEqual(["on_fire"]);
  });

  it("returns totalSessions, totalCardsStudied, totalMinutes from all sessions", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedSession(deps.tables, { started_at: "2026-04-20T09:00:00.000Z", cards_studied: 10, cards_correct: 8, duration_seconds: 300 });
    seedSession(deps.tables, { started_at: "2026-04-21T09:00:00.000Z", rowKey: "2026-04-21T09:00:00.000Z_s-2", cards_studied: 5, cards_correct: 4, duration_seconds: 180, xp_earned: 50 });
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.totalSessions).toBe(2);
    expect(body.totalCardsStudied).toBe(15);
    expect(body.totalMinutes).toBeCloseTo(8); // (300+180)/60 = 8
  });

  it("returns sessionsPerDay trend within range", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedSession(deps.tables, { started_at: "2026-04-20T09:00:00.000Z" });
    // This one is outside 7d range from 2026-04-23
    seedSession(deps.tables, {
      started_at: "2026-04-01T09:00:00.000Z",
      rowKey: "2026-04-01T09:00:00.000Z_s-old",
    });
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID, "7d"), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const sessionsPerDay = body.sessionsPerDay as { date: string; count: number }[];
    const inRange = sessionsPerDay.find((s) => s.date === "2026-04-20");
    expect(inRange).toBeDefined();
    const outOfRange = sessionsPerDay.find((s) => s.date === "2026-04-01");
    expect(outOfRange).toBeUndefined();
  });

  it("returns masteryDistribution from all user cards", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, { rowKey: "card-new", sm2_reps: 0, sm2_interval: 0 });
    seedCard(deps.tables, { rowKey: "card-learning", sm2_reps: 1, sm2_interval: 3 });
    seedCard(deps.tables, { rowKey: "card-mastered", sm2_reps: 6, sm2_interval: 90 });
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const dist = body.masteryDistribution as Record<string, number>;
    expect(dist.new).toBe(1);
    expect(dist.learning).toBe(1);
    expect(dist.mastered).toBe(1);
    expect(dist.young).toBe(0);
    expect(dist.mature).toBe(0);
  });

  it("returns Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    expect((res.headers as Record<string, string>)["Cache-Control"]).toBe("private, max-age=60");
  });

  it("any authenticated user can view stats for another user (family visibility)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables); // USER_ID (u-lex)
    const handler = makeStatsUserHandler(deps);
    // CALLER_ID (u-waldo) fetches stats for USER_ID (u-lex)
    const cookie = validCookie(deps, CALLER_ID);
    const res = await handler(makeReq(cookie, USER_ID), ctx);
    expect(res.status).toBe(200);
  });

  it("returns hourOfDay distribution from attempts", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    // morning attempt
    seedAttempt(deps.tables, { timestamp: "2026-04-20T08:30:00.000Z", rowKey: "2026-04-20T08:30:00.000Z_a-1" });
    // evening attempt
    seedAttempt(deps.tables, { timestamp: "2026-04-20T20:30:00.000Z", rowKey: "2026-04-20T20:30:00.000Z_a-2" });
    const handler = makeStatsUserHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    const body = res.jsonBody as Record<string, unknown>;
    const hourOfDay = body.hourOfDay as { hour: number; attempts: number }[];
    expect(hourOfDay).toHaveLength(24);
    const h8 = hourOfDay.find((h) => h.hour === 8);
    expect(h8?.attempts).toBe(1);
    const h20 = hourOfDay.find((h) => h.hour === 20);
    expect(h20?.attempts).toBe(1);
  });
});
