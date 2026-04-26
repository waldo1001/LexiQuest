import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeSessionsHandler, type SessionsDeps } from "./sessions.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { SessionRow } from "./sessions-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

const ctx = {} as InvocationContext;

const NOW = "2026-04-22T10:00:00.000Z";
const TOMORROW = "2026-04-23T10:00:00.000Z";

function makeReq(
  cookie: string | null,
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "POST", body } = opts;
  return {
    method,
    url: "http://local/api/sessions",
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
    query: { get: () => null },
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

function makeDeps(
  uuids: string[] = [],
  shuffles: ReadonlyArray<readonly number[]> = [],
): SessionsDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  random: FakeRandom;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const random = new FakeRandom(uuids, shuffles);
  return { tables, signer, clock, random };
}

function validCookie(
  deps: ReturnType<typeof makeDeps>,
  userId = "u-lex",
): string {
  const token = deps.signer.sign({
    userId,
    isAdmin: false,
    expMs: deps.clock.nowMs() + 60_000,
  });
  return buildSessionCookie(token);
}

function makeCard(
  courseId: string,
  id: string,
  overrides: Partial<CardRow> = {},
): CardRow {
  return {
    partitionKey: courseId,
    rowKey: id,
    course_id: courseId,
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

function makeCourse(userId: string, courseId: string): CourseRow {
  return {
    partitionKey: userId,
    rowKey: courseId,
    user_id: userId,
    year_id: "y1",
    name: "French",
    emoji: "🇫🇷",
    color: "#ff0000",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: NOW,
  };
}

describe("POST /api/sessions", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps(["sess-1"]);
  });

  it("returns 401 without cookie", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(null, { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing courseId", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { body: { mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid mode", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { body: { courseId: "c1", mode: "bad" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when course not found", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { body: { courseId: "c-ghost", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 400 on missing body", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 405 for GET", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { method: "GET" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 200 with sessionId and due cards when cards exist", async () => {
    deps = makeDeps(["sess-1"], [[0, 1]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-2"));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as { sessionId: string; cards: unknown[] };
    expect(body.sessionId).toBe("sess-1");
    expect(body.cards).toHaveLength(2);
  });

  it("excludes cards where next_review_at is in the future (not due, not new)", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    // Due card (next_review_at <= now)
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-due", { next_review_at: NOW }));
    // Future card that's been seen before (reps>0 → not new, not due)
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-future", {
      next_review_at: TOMORROW,
      sm2_reps: 1,
    }));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { cards: Array<{ id: string }> };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.id).toBe("card-due");
  });

  it("caps new cards at 20", async () => {
    const identity20 = Array.from({ length: 20 }, (_, i) => i);
    deps = makeDeps(["sess-1"], [identity20]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    for (let i = 0; i < 25; i++) {
      await deps.tables.upsert<CardRow>(
        "cards",
        makeCard("c1", `card-${i}`, { next_review_at: TOMORROW, sm2_reps: 0 }),
      );
    }

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { cards: unknown[] };
    expect(body.cards).toHaveLength(20);
  });

  it("persists session row in table storage with ended_at=null", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    );

    const sessions = await deps.tables.listByPartition<SessionRow>("sessions", "u-lex");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.ended_at).toBeNull();
    expect(sessions[0]?.course_id).toBe("c1");
    expect(sessions[0]?.mode).toBe("self_grade");
    expect(sessions[0]?.user_id).toBe("u-lex");
  });

  it("returns 200 with empty cards array when no due/new cards", async () => {
    deps = makeDeps(["sess-1"], [[]]); // empty array is valid for empty shuffle
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade" } }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { sessionId: string; cards: unknown[] };
    expect(res.status).toBe(200);
    expect(body.cards).toHaveLength(0);
  });

  it("persists game_type and card_limit on session row", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", gameType: "boss_round", cardLimit: 10 },
      }),
      ctx,
    );

    const sessions = await deps.tables.listByPartition<SessionRow>("sessions", "u-lex");
    expect(sessions[0]?.game_type).toBe("boss_round");
    expect(sessions[0]?.card_limit).toBe(10);
  });

  it("defaults game_type=classic and card_limit=null when not specified", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade" },
      }),
      ctx,
    );

    const sessions = await deps.tables.listByPartition<SessionRow>("sessions", "u-lex");
    expect(sessions[0]?.game_type).toBe("classic");
    expect(sessions[0]?.card_limit).toBeNull();
  });

  it("with cardLimit=10 returns at most 10 cards", async () => {
    const identity10 = Array.from({ length: 10 }, (_, i) => i);
    deps = makeDeps(["sess-1"], [identity10]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    for (let i = 0; i < 30; i++) {
      await deps.tables.upsert<CardRow>("cards", makeCard("c1", `card-${i}`));
    }

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", cardLimit: 10 },
      }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { cards: unknown[] };
    expect(body.cards.length).toBeLessThanOrEqual(10);
  });

  it("speed_round response includes time_limit_seconds=60", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", gameType: "speed_round" },
      }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { time_limit_seconds: number | null };
    expect(body.time_limit_seconds).toBe(60);
  });

  it("classic response has time_limit_seconds=null", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade" },
      }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { time_limit_seconds: number | null };
    expect(body.time_limit_seconds).toBeNull();
  });

  it("returns 400 for invalid gameType", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { body: { courseId: "c1", mode: "self_grade", gameType: "invalid" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 for cardLimit=0", async () => {
    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps), { body: { courseId: "c1", mode: "self_grade", cardLimit: 0 } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("boss_round with no hard cards backfills to available cards", async () => {
    deps = makeDeps(["sess-1"], [[]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    // Card with high ease (not hard) — gets backfilled
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "easy", {
      sm2_ease: 2.5,
      sm2_reps: 3,
      next_review_at: NOW,
    }));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", gameType: "boss_round", cardLimit: 10 },
      }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as { cards: unknown[] };
    // No hard cards in primary, but backfill adds available cards up to limit
    expect(body.cards).toHaveLength(1);
  });

  it("review_blitz with no overdue cards returns empty array", async () => {
    deps = makeDeps(["sess-1"], [[]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    // Only future card
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "future", {
      sm2_reps: 3,
      next_review_at: TOMORROW,
    }));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", gameType: "review_blitz" },
      }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as { cards: unknown[] };
    expect(body.cards).toHaveLength(0);
  });

  it("user_id comes from session token, not body", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-1"));

    await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), {
        body: { courseId: "c1", mode: "self_grade", userId: "u-hacker" },
      }),
      ctx,
    );

    const sessions = await deps.tables.listByPartition<SessionRow>("sessions", "u-lex");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.user_id).toBe("u-lex");

    const hackerSessions = await deps.tables.listByPartition<SessionRow>("sessions", "u-hacker");
    expect(hackerSessions).toHaveLength(0);
  });

  it("mcq mode only returns cards with >= 2 distractors", async () => {
    deps = makeDeps(["sess-1"], [[0]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    // Card with distractors (MCQ-capable)
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-mcq", {
      distractors: ["d1", "d2", "d3"],
    }));
    // Card without distractors (not MCQ-capable)
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-plain", {
      distractors: [],
    }));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "mcq" } }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { cards: Array<{ id: string }> };
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.id).toBe("card-mcq");
  });

  it("uploadId filters cards to only that upload group", async () => {
    deps = makeDeps(["sess-1"], [[0, 1]]);
    await deps.tables.upsert<CourseRow>("courses", makeCourse("u-lex", "c1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-a", { upload_id: "up-1" }));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-b", { upload_id: "up-1" }));
    await deps.tables.upsert<CardRow>("cards", makeCard("c1", "card-c", { upload_id: "up-2" }));

    const res = (await makeSessionsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { body: { courseId: "c1", mode: "self_grade", uploadId: "up-1" } }),
      ctx,
    )) as HttpResponseInit;

    const body = res.jsonBody as { cards: Array<{ id: string }> };
    expect(body.cards).toHaveLength(2);
    const ids = body.cards.map((c) => c.id).sort();
    expect(ids).toEqual(["card-a", "card-b"]);
  });
});
