import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsHeatmapHandler, type StatsHeatmapDeps } from "./stats-heatmap.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { AttemptRow } from "./attempts-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const USER_ID = "u-lex";
const CALLER_ID = "u-waldo";

function makeReq(cookie: string | null, userId: string, range?: string): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats/heatmap/${userId}`,
    params: { userId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => (k === "range" ? (range ?? null) : null) },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsHeatmapDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = CALLER_ID) {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage, userId = USER_ID): UserRow {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
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

function seedAttempt(tables: FakeTableStorage, overrides: Partial<AttemptRow> = {}): AttemptRow {
  const ts = overrides.timestamp ?? "2026-04-20T09:05:00.000Z";
  const row: AttemptRow = {
    partitionKey: overrides.partitionKey ?? USER_ID,
    rowKey: overrides.rowKey ?? `${ts}_a-1`,
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

describe("GET /api/stats/heatmap/:userId", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(null, USER_ID), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const handler = makeStatsHeatmapHandler(deps);
    const req = { ...makeReq(validCookie(deps), USER_ID), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("returns 404 for unknown userId", async () => {
    const deps = makeDeps();
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "u-nobody"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns empty array when user has no attempts", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as { heatmap: unknown[] };
    expect(body.heatmap).toEqual([]);
  });

  it("returns [{date, count}] grouped by day", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const ts1 = "2026-04-20T09:00:00.000Z";
    const ts2 = "2026-04-20T14:00:00.000Z";
    const ts3 = "2026-04-21T10:00:00.000Z";
    seedAttempt(deps.tables, { timestamp: ts1, rowKey: `${ts1}_a1` });
    seedAttempt(deps.tables, { timestamp: ts2, rowKey: `${ts2}_a2` });
    seedAttempt(deps.tables, { timestamp: ts3, rowKey: `${ts3}_a3` });
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    const body = res.jsonBody as { heatmap: Array<{ date: string; count: number }> };
    expect(body.heatmap).toHaveLength(2);
    const apr20 = body.heatmap.find((h) => h.date === "2026-04-20");
    expect(apr20?.count).toBe(2);
    const apr21 = body.heatmap.find((h) => h.date === "2026-04-21");
    expect(apr21?.count).toBe(1);
  });

  it("returns Cache-Control: private, max-age=60", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID), ctx);
    expect((res.headers as Record<string, string>)["Cache-Control"]).toBe("private, max-age=60");
  });

  it("any authenticated user can view heatmap for another user", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const handler = makeStatsHeatmapHandler(deps);
    const cookie = validCookie(deps, CALLER_ID);
    const res = await handler(makeReq(cookie, USER_ID), ctx);
    expect(res.status).toBe(200);
  });

  it("range filter limits the date window", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_ID);
    const inRange = "2026-04-20T09:00:00.000Z";
    const outOfRange = "2026-01-01T09:00:00.000Z"; // > 7d ago from 2026-04-23
    seedAttempt(deps.tables, { timestamp: inRange, rowKey: `${inRange}_a1` });
    seedAttempt(deps.tables, { timestamp: outOfRange, rowKey: `${outOfRange}_a2` });
    const handler = makeStatsHeatmapHandler(deps);
    const res = await handler(makeReq(validCookie(deps), USER_ID, "7d"), ctx);
    const body = res.jsonBody as { heatmap: Array<{ date: string; count: number }> };
    expect(body.heatmap.find((h) => h.date === "2026-04-20")).toBeDefined();
    expect(body.heatmap.find((h) => h.date === "2026-01-01")).toBeUndefined();
  });
});
