import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsReverseHandler, type CardsReverseDeps } from "./cards-reverse.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-25T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    url: "http://local/api/cards/reverse",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

const SCRIPTED_UUIDS = [
  "rev-1", "rev-2", "rev-3", "rev-4", "rev-5",
  "rev-6", "rev-7", "rev-8", "rev-9", "rev-10",
];

function makeDeps(): CardsReverseDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  random: FakeRandom;
} {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  const random = new FakeRandom(SCRIPTED_UUIDS);
  return { tables, signer, clock, random };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID): string {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function adminCookie(deps: ReturnType<typeof makeDeps>): string {
  const token = deps.signer.sign({ userId: "u-admin", isAdmin: true, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

async function seedUser(deps: ReturnType<typeof makeDeps>, userId = USER_ID): Promise<void> {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    id: userId,
    name: "Lex",
    password_hash: "x",
    is_admin: false,
    color: "#111",
    avatar_emoji: "🦊",
    ui_language: "en",
    settings: JSON.stringify({ auto_speak: false }),
    created_at: NOW,
  };
  await deps.tables.upsert<UserRow>("users", row);
}

async function seedCourse(
  deps: ReturnType<typeof makeDeps>,
  overrides: Partial<CourseRow> = {},
): Promise<CourseRow> {
  const row: CourseRow = {
    partitionKey: USER_ID,
    rowKey: COURSE_ID,
    user_id: USER_ID,
    year_id: "year-2026",
    name: "French",
    emoji: "🇫🇷",
    color: "#0057a8",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: NOW,
    ...overrides,
  };
  await deps.tables.upsert<CourseRow>("courses", row);
  return row;
}

function makeCard(id: string, overrides: Partial<CardRow> = {}): CardRow {
  return {
    partitionKey: COURSE_ID,
    rowKey: id,
    course_id: COURSE_ID,
    question: "the dog",
    answer: "le chien",
    distractors: ["le chat"],
    hint: "think of a pet",
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: NOW,
    created_at: NOW,
    reverse_of: null,
    ...overrides,
  };
}

let deps: ReturnType<typeof makeDeps>;
beforeEach(async () => {
  deps = makeDeps();
  await seedUser(deps);
  await seedCourse(deps);
});

describe("POST /api/cards/reverse", () => {
  it("returns 401 when no session cookie", async () => {
    const res = await makeCardsReverseHandler(deps)(makeReq(null, { courseId: COURSE_ID }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when course not found", async () => {
    const res = await makeCardsReverseHandler(deps)(
      makeReq(validCookie(deps), { courseId: "nonexistent" }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is neither owner nor admin", async () => {
    await seedUser(deps, "u-other");
    const token = deps.signer.sign({ userId: "u-other", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const cookie = buildSessionCookie(token);
    const res = await makeCardsReverseHandler(deps)(makeReq(cookie, { courseId: COURSE_ID }), ctx);
    expect(res.status).toBe(403);
  });

  it("creates a reverse card for each forward card and returns counts", async () => {
    const card1 = makeCard("card-1");
    const card2 = makeCard("card-2", { question: "the cat", answer: "le chat" });
    await deps.tables.upsert<CardRow>("cards", card1);
    await deps.tables.upsert<CardRow>("cards", card2);

    const res = await makeCardsReverseHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.jsonBody as { created: number; skipped: number };
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(0);

    const allCards = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(allCards.length).toBe(4); // 2 original + 2 reverses
  });

  it("is idempotent: second invocation creates 0, skips all", async () => {
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));

    await makeCardsReverseHandler(deps)(makeReq(validCookie(deps), { courseId: COURSE_ID }), ctx);
    // reset uuid counter
    deps.random = new FakeRandom(["rev-10", "rev-11"]);
    const res = await makeCardsReverseHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    const body = res.jsonBody as { created: number; skipped: number };
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("reverses 'le chien|le chiot' → 'the dog' as 'le chien' → 'the dog'", async () => {
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1", {
      question: "the dog",
      answer: "le chien|le chiot",
    }));

    await makeCardsReverseHandler(deps)(makeReq(validCookie(deps), { courseId: COURSE_ID }), ctx);
    const allCards = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const rev = allCards.find((c) => c.reverse_of === "card-1");
    expect(rev).toBeDefined();
    expect(rev!.question).toBe("le chien");
    expect(rev!.answer).toBe("the dog");
  });

  it("does not reverse a card that is already a reverse", async () => {
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("rev-existing", {
      question: "le chien",
      answer: "the dog",
      source: "reverse",
      reverse_of: "card-1",
    }));

    const res = await makeCardsReverseHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    const body = res.jsonBody as { created: number; skipped: number };
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("reverse rows have source='reverse', reverse_of=<forwardId>, distractors=[], hint=null, fresh SM-2", async () => {
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1", {
      sm2_ease: 3.0,
      sm2_interval: 10,
      sm2_reps: 5,
      hint: "some hint",
      distractors: ["a", "b"],
    }));

    await makeCardsReverseHandler(deps)(makeReq(validCookie(deps), { courseId: COURSE_ID }), ctx);
    const allCards = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const rev = allCards.find((c) => c.reverse_of === "card-1");
    expect(rev).toBeDefined();
    expect(rev!.source).toBe("reverse");
    expect(rev!.reverse_of).toBe("card-1");
    expect(rev!.distractors).toEqual([]);
    expect(rev!.hint).toBeNull();
    expect(rev!.sm2_ease).toBe(2.5);
    expect(rev!.sm2_interval).toBe(0);
    expect(rev!.sm2_reps).toBe(0);
  });

  it("admin can reverse cards for another user's course", async () => {
    await seedUser(deps, "u-admin");
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));

    const res = await makeCardsReverseHandler(deps)(
      makeReq(adminCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { created: number }).created).toBe(1);
  });

  it("returns 400 when courseId is missing", async () => {
    const res = await makeCardsReverseHandler(deps)(makeReq(validCookie(deps), {}), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 405 for non-POST method", async () => {
    const res = await makeCardsReverseHandler(deps)(makeReq(validCookie(deps), {}, "GET"), ctx);
    expect(res.status).toBe(405);
  });
});
