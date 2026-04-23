import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsFamilyHandler, makeStatsCompareHandler, type StatsFamilyDeps } from "./stats-family.js";
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

function makeReq(cookie: string | null, path: string, query: Record<string, string> = {}): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats${path}`,
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => query[k] ?? null },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsFamilyDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
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

// ─── GET /api/stats/family ──────────────────────────────────────────────────

describe("GET /api/stats/family", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeReq(null, "/family"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsFamilyHandler(deps);
    const req = { ...makeReq(validCookie(deps), "/family"), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("returns one entry per user with compact shape", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 5, total_xp: 1000, badges: [] } });
    seedUser(deps.tables, USER_B, { settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, streak: 2, total_xp: 400, badges: [] } });
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "/family"), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as { users: unknown[] };
    expect(body.users).toHaveLength(2);
    const lex = (body.users as Array<Record<string, unknown>>).find((u) => u.userId === USER_A);
    expect(lex?.xp).toBe(1000);
    expect(lex?.streak).toBe(5);
    expect(lex?.name).toBe("Lex");
  });

  it("computes accuracy from sessions in range", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", cards_studied: 10, cards_correct: 8 });
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeReq(validCookie(deps, USER_A), "/family", { range: "30d" }), ctx);
    const body = res.jsonBody as { users: Array<Record<string, unknown>> };
    const lex = body.users.find((u) => u.userId === USER_A);
    expect(lex?.accuracy).toBe(80); // 8/10 * 100
  });

  it("returns Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "/family"), ctx);
    expect((res.headers as Record<string, string>)["Cache-Control"]).toBe("private, max-age=60");
  });

  it("handles user with no xp or streak in settings (defaults to 0)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, {
      settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
    });
    const handler = makeStatsFamilyHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "/family"), ctx);
    const body = res.jsonBody as { users: Array<Record<string, unknown>> };
    const lex = body.users.find((u) => u.userId === USER_A);
    expect(lex?.xp).toBe(0);
    expect(lex?.streak).toBe(0);
  });
});

// ─── GET /api/stats/compare ─────────────────────────────────────────────────

describe("GET /api/stats/compare", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(makeReq(null, "/compare", { userIds: USER_A, metric: "xp" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when userIds is missing", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "/compare", { metric: "xp" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when metric is invalid", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "invalid" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns time series with one entry per day per user (xp metric)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedUser(deps.tables, USER_B);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", xp_earned: 100 });
    seedSession(deps.tables, USER_B, { started_at: "2026-04-20T09:00:00.000Z", rowKey: "2026-04-20T09:00:00.000Z_s-mats", xp_earned: 60 });
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: `${USER_A},${USER_B}`, metric: "xp", range: "30d" }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.jsonBody as { series: Array<Record<string, unknown>> };
    const apr20 = body.series.find((s) => s.date === "2026-04-20");
    expect(apr20).toBeDefined();
    expect(apr20?.[USER_A]).toBe(100);
    expect(apr20?.[USER_B]).toBe(60);
  });

  it("returns Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "xp" }),
      ctx,
    );
    expect((res.headers as Record<string, string>)["Cache-Control"]).toBe("private, max-age=60");
  });

  it("returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeStatsCompareHandler(deps);
    const req = { ...makeReq(validCookie(deps), "/compare"), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("sessions metric returns session count per day", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z" });
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T15:00:00.000Z", rowKey: "2026-04-20T15:00:00.000Z_s2" });
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "sessions", range: "30d" }),
      ctx,
    );
    const body = res.jsonBody as { series: Array<Record<string, unknown>> };
    const apr20 = body.series.find((s) => s.date === "2026-04-20");
    expect(apr20?.[USER_A]).toBe(2);
  });

  it("cards metric returns cards_studied per day", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", cards_studied: 15 });
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "cards", range: "30d" }),
      ctx,
    );
    const body = res.jsonBody as { series: Array<Record<string, unknown>> };
    const apr20 = body.series.find((s) => s.date === "2026-04-20");
    expect(apr20?.[USER_A]).toBe(15);
  });

  it("minutes metric returns duration in minutes", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", duration_seconds: 600 });
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "minutes", range: "30d" }),
      ctx,
    );
    const body = res.jsonBody as { series: Array<Record<string, unknown>> };
    const apr20 = body.series.find((s) => s.date === "2026-04-20");
    expect(apr20?.[USER_A]).toBe(10); // 600s / 60 = 10min
  });

  it("accuracy metric returns pct correct", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedSession(deps.tables, USER_A, { started_at: "2026-04-20T09:00:00.000Z", cards_studied: 10, cards_correct: 7 });
    const handler = makeStatsCompareHandler(deps);
    const res = await handler(
      makeReq(validCookie(deps), "/compare", { userIds: USER_A, metric: "accuracy", range: "30d" }),
      ctx,
    );
    const body = res.jsonBody as { series: Array<Record<string, unknown>> };
    const apr20 = body.series.find((s) => s.date === "2026-04-20");
    expect(apr20?.[USER_A]).toBe(70); // 7/10 * 100
  });
});
