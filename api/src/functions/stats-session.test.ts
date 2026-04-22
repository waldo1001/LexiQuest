import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsSessionHandler, type StatsSessionDeps } from "./stats-session.js";
import type { SessionRow } from "./sessions-shared.js";
import { makeSessionRowKey } from "./sessions-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-22T10:00:00.000Z";
const SESSION_ID = "sess-xyz";
const USER_ID = "u-lex";
const COURSE_ID = "c1";
const STARTED_AT = "2026-04-22T09:50:00.000Z";

function makeReq(cookie: string | null, sessionId: string): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats/session/${sessionId}`,
    params: { id: sessionId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsSessionDeps & { tables: FakeTableStorage; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID) {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: Date.now() + 60_000 });
  return buildSessionCookie(token);
}

function seedSession(
  tables: FakeTableStorage,
  overrides: Partial<SessionRow> = {},
): SessionRow {
  const row: SessionRow = {
    partitionKey: USER_ID,
    rowKey: makeSessionRowKey(STARTED_AT, SESSION_ID),
    user_id: USER_ID,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: STARTED_AT,
    ended_at: NOW,
    cards_studied: 10,
    cards_correct: 8,
    xp_earned: 100,
    duration_seconds: 600,
    ...overrides,
  };
  void tables.upsert("sessions", row);
  return row;
}

describe("GET /api/stats/session/:id", () => {
  it("AC1: returns 401 when no cookie", async () => {
    const deps = makeDeps();
    const res = await makeStatsSessionHandler(deps)(makeReq(null, SESSION_ID), ctx);
    expect(res.status).toBe(401);
  });

  it("AC2: returns 404 for unknown session id", async () => {
    const deps = makeDeps();
    const cookie = validCookie(deps);
    const res = await makeStatsSessionHandler(deps)(makeReq(cookie, "no-such-session"), ctx);
    expect(res.status).toBe(404);
  });

  it("AC3: returns session data for own session", async () => {
    const deps = makeDeps();
    seedSession(deps.tables);
    const cookie = validCookie(deps);
    const res = await makeStatsSessionHandler(deps)(makeReq(cookie, SESSION_ID), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe(SESSION_ID);
    expect(body.cards_studied).toBe(10);
    expect(body.cards_correct).toBe(8);
    expect(body.xp_earned).toBe(100);
    expect(body.duration_seconds).toBe(600);
  });

  it("AC4: returns accuracy field (cards_correct / cards_studied * 100)", async () => {
    const deps = makeDeps();
    seedSession(deps.tables);
    const cookie = validCookie(deps);
    const res = await makeStatsSessionHandler(deps)(makeReq(cookie, SESSION_ID), ctx);
    expect((res.jsonBody as Record<string, unknown>).accuracy).toBe(80);
  });

  it("AC5: returns 0 accuracy when cards_studied is 0", async () => {
    const deps = makeDeps();
    seedSession(deps.tables, { cards_studied: 0, cards_correct: 0 });
    const cookie = validCookie(deps);
    const res = await makeStatsSessionHandler(deps)(makeReq(cookie, SESSION_ID), ctx);
    expect((res.jsonBody as Record<string, unknown>).accuracy).toBe(0);
  });

  it("AC6: any authenticated user can read any session (stats are public within family)", async () => {
    const deps = makeDeps();
    seedSession(deps.tables); // session belongs to USER_ID

    // seed USER_ID as a user so the scanner can find the session
    const userRow: UserRow = {
      partitionKey: PARTITIONS.users,
      rowKey: USER_ID,
      id: USER_ID,
      name: "Lex",
      password_hash: "x",
      is_admin: false,
      color: "#111",
      avatar_emoji: "🦊",
      ui_language: "en",
      settings: JSON.stringify({ auto_speak: false, preferred_mode: "self_grade", daily_goal: 20 }),
      created_at: NOW,
    };
    void deps.tables.upsert("users", userRow);

    const otherSignerDeps = { tables: deps.tables, signer: new FakeSessionSigner(new FakeClock(NOW)) };
    const otherToken = otherSignerDeps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: Date.now() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeStatsSessionHandler(deps)(makeReq(otherCookie, SESSION_ID), ctx);
    expect(res.status).toBe(200);
  });

  it("AC7: returns 405 for non-GET method", async () => {
    const deps = makeDeps();
    const req = { ...makeReq(validCookie(deps), SESSION_ID), method: "POST" } as unknown as HttpRequest;
    const res = await makeStatsSessionHandler(deps)(req, ctx);
    expect(res.status).toBe(405);
  });
});
