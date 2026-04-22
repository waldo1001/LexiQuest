import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeAttemptsHandler, type AttemptsDeps } from "./attempts.js";
import type { CardRow } from "./cards-shared.js";
import type { SessionRow } from "./sessions-shared.js";
import type { AttemptRow } from "./attempts-shared.js";
import { makeSessionRowKey } from "./sessions-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-22T10:00:00.000Z";
const COURSE_ID = "c1";
const USER_ID = "u-lex";
const SESSION_ID = "sess-1";

function makeReq(
  cookie: string | null,
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "POST", body } = opts;
  return {
    method,
    url: "http://local/api/attempts",
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

function makeDeps(uuids: string[] = []): AttemptsDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  random: FakeRandom;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const random = new FakeRandom(uuids);
  return { tables, signer, clock, random };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID): string {
  const token = deps.signer.sign({
    userId,
    isAdmin: false,
    expMs: deps.clock.nowMs() + 60_000,
  });
  return buildSessionCookie(token);
}

function makeCard(id: string, overrides: Partial<CardRow> = {}): CardRow {
  return {
    partitionKey: COURSE_ID,
    rowKey: id,
    course_id: COURSE_ID,
    question: `Q${id}`,
    answer: `A${id}`,
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: NOW,
    created_at: NOW,
    ...overrides,
  };
}

function makeSession(userId = USER_ID): SessionRow {
  return {
    partitionKey: userId,
    rowKey: makeSessionRowKey(NOW, SESSION_ID),
    user_id: userId,
    course_id: COURSE_ID,
    mode: "self_grade",
    started_at: NOW,
    ended_at: null,
    cards_studied: 0,
    cards_correct: 0,
    xp_earned: 0,
    duration_seconds: 0,
  };
}

const validBody = () => ({
  sessionId: SESSION_ID,
  items: [
    { cardId: "card-1", correct: true, mode: "self_grade", response_time_ms: 1500 },
    { cardId: "card-2", correct: false, mode: "self_grade", response_time_ms: 800 },
  ],
});

describe("POST /api/attempts", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps(["att-1", "att-2"]);
  });

  it("returns 401 without cookie", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(null, { body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 405 for GET", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { method: "GET" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 400 on missing body", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing sessionId", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { body: { items: [validBody().items[0]] } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty items array", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { body: { sessionId: SESSION_ID, items: [] } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { body: { sessionId: "ghost", items: [validBody().items[0]] } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 404 when card not found", async () => {
    await deps.tables.upsert<SessionRow>("sessions", makeSession());
    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), {
        body: { sessionId: SESSION_ID, items: [{ cardId: "ghost", correct: true, mode: "self_grade", response_time_ms: 100 }] },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("persists attempt rows with correct row-key format", async () => {
    await deps.tables.upsert<SessionRow>("sessions", makeSession());
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2"));

    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { body: validBody() }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(201);
    const attempts = await deps.tables.listByPartition<AttemptRow>("attempts", USER_ID);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.rowKey).toMatch(/^2026-04-22T10:00:00\.000Z_att-1$/);
    expect(attempts[0]?.correct).toBe(true);
    expect(attempts[1]?.correct).toBe(false);
  });

  it("updates SM-2 fields on each card after attempt", async () => {
    await deps.tables.upsert<SessionRow>("sessions", makeSession());
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1", { sm2_reps: 0, sm2_interval: 0, sm2_ease: 2.5 }));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2", { sm2_reps: 0, sm2_interval: 0, sm2_ease: 2.5 }));

    await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps), { body: validBody() }),
      ctx,
    );

    const card1 = await deps.tables.getById<CardRow>("cards", COURSE_ID, "card-1");
    const card2 = await deps.tables.getById<CardRow>("cards", COURSE_ID, "card-2");

    // correct → reps=1, interval=1
    expect(card1?.sm2_reps).toBe(1);
    expect(card1?.sm2_interval).toBe(1);
    // incorrect → reps=0, interval=1
    expect(card2?.sm2_reps).toBe(0);
    expect(card2?.sm2_interval).toBe(1);
  });

  it("user_id on attempt comes from session token (invariant 1)", async () => {
    await deps.tables.upsert<SessionRow>("sessions", makeSession());
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2"));

    await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps, USER_ID), {
        body: { ...validBody(), userId: "u-hacker" },
      }),
      ctx,
    );

    const legit = await deps.tables.listByPartition<AttemptRow>("attempts", USER_ID);
    const hacker = await deps.tables.listByPartition<AttemptRow>("attempts", "u-hacker");
    expect(legit).toHaveLength(2);
    expect(hacker).toHaveLength(0);
  });

  it("rejects attempt against another user's session (403)", async () => {
    // Seed u-mats in users table so the cross-partition scan can find their session
    await deps.tables.upsert("users", {
      partitionKey: "users",
      rowKey: "u-mats",
      name: "Mats",
      is_admin: false,
      color: "#aabbcc",
      avatar_emoji: "🐻",
      ui_language: "nl",
      settings: "{}",
      created_at: NOW,
    });
    await deps.tables.upsert<SessionRow>("sessions", makeSession("u-mats"));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2"));

    const res = (await makeAttemptsHandler(deps)(
      makeReq(validCookie(deps, USER_ID), { body: validBody() }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(403);
  });
});
