import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeSessionsIdHandler, type SessionsIdDeps } from "./sessions-id.js";
import type { SessionRow } from "./sessions-shared.js";
import { makeSessionRowKey } from "./sessions-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

const ctx = {} as InvocationContext;
const STARTED_AT = "2026-04-22T09:00:00.000Z";
const NOW = "2026-04-22T09:05:00.000Z"; // 5 minutes later → 300 seconds duration
const SESSION_ID = "sess-1";
const USER_ID = "u-lex";
const COURSE_ID = "c1";

function makeReq(
  cookie: string | null,
  sessionId: string,
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "PUT", body } = opts;
  return {
    method,
    url: `http://local/api/sessions/${sessionId}`,
    params: { id: sessionId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

function makeDeps(): SessionsIdDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID): string {
  const token = deps.signer.sign({
    userId,
    isAdmin: false,
    expMs: deps.clock.nowMs() + 60_000,
  });
  return buildSessionCookie(token);
}

function makeSession(userId = USER_ID): SessionRow {
  return {
    partitionKey: userId,
    rowKey: makeSessionRowKey(STARTED_AT, SESSION_ID),
    user_id: userId,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: STARTED_AT,
    ended_at: null,
    cards_studied: 0,
    cards_correct: 0,
    xp_earned: 0,
    duration_seconds: 0,
  };
}

describe("PUT /api/sessions/:id", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("returns 401 without cookie", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(null, SESSION_ID, { body: { cards_studied: 5, cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-PUT method", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { method: "GET" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 400 on missing body", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when cards_studied is missing", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { body: { cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when cards_correct is missing", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { body: { cards_studied: 5 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { body: { cards_studied: 5, cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when session belongs to another user", async () => {
    await deps.tables.upsert("users", {
      partitionKey: "users", rowKey: "u-mats",
      name: "Mats", is_admin: false, color: "#aaa", avatar_emoji: "🐻",
      ui_language: "nl", settings: "{}", created_at: STARTED_AT,
    });
    await deps.tables.upsert<SessionRow>("sessions", makeSession("u-mats"));

    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps, USER_ID), SESSION_ID, { body: { cards_studied: 5, cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("closes session: sets ended_at, cards_studied, cards_correct, duration_seconds", async () => {
    await deps.tables.upsert<SessionRow>("sessions", makeSession());

    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { body: { cards_studied: 5, cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.ended_at).toBe(NOW);
    expect(body.cards_studied).toBe(5);
    expect(body.cards_correct).toBe(3);
    expect(body.duration_seconds).toBe(300); // 5 minutes = 300 seconds

    const stored = await deps.tables.listByPartition<SessionRow>("sessions", USER_ID);
    expect(stored[0]?.ended_at).toBe(NOW);
    expect(stored[0]?.duration_seconds).toBe(300);
  });

  it("returns 409 when session already closed", async () => {
    const closed = { ...makeSession(), ended_at: STARTED_AT };
    await deps.tables.upsert<SessionRow>("sessions", closed);

    const res = (await makeSessionsIdHandler(deps)(
      makeReq(validCookie(deps), SESSION_ID, { body: { cards_studied: 5, cards_correct: 3 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(409);
  });
});
