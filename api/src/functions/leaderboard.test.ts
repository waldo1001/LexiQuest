import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeLeaderboardHandler, type LeaderboardDeps } from "./leaderboard.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { SessionRow } from "./sessions-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const USER_A = "u-lex";
const USER_B = "u-mats";

function makeReq(cookie: string | null, query: Record<string, string> = {}): HttpRequest {
  return {
    method: "GET",
    url: "http://local/api/leaderboard",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => query[k] ?? null },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): LeaderboardDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_A) {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage, userId: string, overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    name: userId === USER_A ? "Lex" : "Mats",
    password_hash: "hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: userId === USER_A ? "🐯" : "🐻",
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
    ...overrides,
  };
  tables.upsert("users", row);
  return row;
}

function seedSession(tables: FakeTableStorage, userId: string, overrides: Partial<SessionRow> = {}): SessionRow {
  const started = overrides.started_at ?? "2026-04-20T09:00:00.000Z";
  const row: SessionRow = {
    partitionKey: userId,
    rowKey: `${started}_s-${userId}`,
    user_id: userId,
    course_id: "course-1",
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

describe("GET /api/leaderboard", () => {
  it("LB-1: returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(null), ctx);
    expect(res.status).toBe(401);
  });

  it("LB-2: returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeLeaderboardHandler(deps);
    const req = { ...makeReq(validCookie(deps)), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("LB-3: returns entries sorted by XP desc", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 5, total_xp: 1000, badges: [] } });
    seedUser(deps.tables, USER_B, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 2, total_xp: 400, badges: [] } });
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as { rankings: Array<{ userId: string; xp: number }> };
    expect(body.rankings[0].userId).toBe(USER_A);
    expect(body.rankings[0].xp).toBe(1000);
    expect(body.rankings[1].userId).toBe(USER_B);
    expect(body.rankings[1].xp).toBe(400);
  });

  it("LB-4: each entry has required fields", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A);
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    const body = res.jsonBody as { rankings: Array<Record<string, unknown>> };
    const entry = body.rankings[0];
    expect(entry).toMatchObject({
      userId: USER_A,
      name: "Lex",
      color: "#16a34a",
      avatar: "🐯",
      xp: expect.any(Number),
      sessions: expect.any(Number),
      cardsStudied: expect.any(Number),
      accuracy: expect.any(Number),
      streak: expect.any(Number),
    });
  });

  it("LB-5: returns secondary rankings: mostAccurate, longestStreak, mostSessions", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 10, total_xp: 1000, badges: [] } });
    seedUser(deps.tables, USER_B, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 2, total_xp: 400, badges: [] } });
    seedSession(deps.tables, USER_A, { cards_studied: 10, cards_correct: 10 }); // 100% accuracy
    seedSession(deps.tables, USER_B, { cards_studied: 10, cards_correct: 5 });  // 50% accuracy
    seedSession(deps.tables, USER_B, { started_at: "2026-04-21T09:00:00.000Z" }); // USER_B has 2 sessions
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    const body = res.jsonBody as {
      rankings: unknown[];
      mostAccurate: { userId: string };
      longestStreak: { userId: string };
      mostSessions: { userId: string };
    };
    expect(body.mostAccurate.userId).toBe(USER_A);
    expect(body.longestStreak.userId).toBe(USER_A);
    expect(body.mostSessions.userId).toBe(USER_B);
  });

  it("LB-6: period=7d only includes sessions from last 7 days", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedUser(deps.tables, USER_B);
    // USER_A: recent session (within 7d)
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", xp_earned: 500, cards_studied: 20 });
    // USER_B: old session (>7d ago)
    seedSession(deps.tables, USER_B, { started_at: "2026-01-01T09:00:00.000Z", xp_earned: 500, cards_studied: 20 });
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps), { period: "7d" }), ctx);
    const body = res.jsonBody as { rankings: Array<{ userId: string; sessions: number }> };
    const lexEntry = body.rankings.find((r) => r.userId === USER_A);
    const matsEntry = body.rankings.find((r) => r.userId === USER_B);
    expect(lexEntry?.sessions).toBe(1);
    expect(matsEntry?.sessions).toBe(0);
  });

  it("LB-7: period=all uses all sessions regardless of date", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2024-01-01T09:00:00.000Z" });
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps), { period: "all" }), ctx);
    const body = res.jsonBody as { rankings: Array<{ userId: string; sessions: number }> };
    const entry = body.rankings.find((r) => r.userId === USER_A);
    expect(entry?.sessions).toBe(1);
  });

  it("LB-8: sets Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(res.headers?.["Cache-Control"]).toBe("private, max-age=60");
  });

  it("LB-9: user with no settings falls back to zero xp and zero streak", async () => {
    const deps = makeDeps();
    const row = seedUser(deps.tables, USER_A);
    // Remove settings to trigger `u.settings ?? {}` and `settings.total_xp ?? 0`
    (row as unknown as Record<string, unknown>).settings = undefined;
    deps.tables.upsert("users", row);
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as { rankings: Array<{ xp: number; streak: number }> };
    expect(body.rankings[0].xp).toBe(0);
    expect(body.rankings[0].streak).toBe(0);
  });

  it("LB-10: second user with better accuracy and streak triggers update-best branches", async () => {
    const deps = makeDeps();
    // USER_A (inserted first → initial reduce value): low accuracy, low streak
    seedUser(deps.tables, USER_A, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 1, total_xp: 100, badges: [] } });
    seedSession(deps.tables, USER_A, { cards_studied: 10, cards_correct: 5 }); // 50% accuracy
    // USER_B (inserted second): better accuracy, better streak → both TRUE branches taken
    seedUser(deps.tables, USER_B, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 20, total_xp: 50, badges: [] } });
    seedSession(deps.tables, USER_B, { started_at: "2026-04-20T10:00:00.000Z", cards_studied: 10, cards_correct: 10 }); // 100% accuracy
    const handler = makeLeaderboardHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    const body = res.jsonBody as {
      mostAccurate: { userId: string };
      longestStreak: { userId: string };
    };
    expect(body.mostAccurate.userId).toBe(USER_B);
    expect(body.longestStreak.userId).toBe(USER_B);
  });
});
