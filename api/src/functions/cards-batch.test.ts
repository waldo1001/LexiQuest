import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsBatchHandler, makeUploadRenameHandler, type CardsBatchDeps } from "./cards-batch.js";
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
const NOW = "2026-04-23T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";

const CARD_INPUTS = [
  { question: "le chien", answer: "the dog", distractors: ["the cat", "the bird"] },
  { question: "la maison", answer: "the house", distractors: ["the car", "the tree"] },
];

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    url: "http://local/api/cards/batch",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

const SCRIPTED_UUIDS = [
  "id-1", "id-2", "id-3", "id-4", "id-5",
  "id-6", "id-7", "id-8", "id-9", "id-10",
];

function makeDeps(): CardsBatchDeps & {
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

async function seedCourse(
  deps: ReturnType<typeof makeDeps>,
  overrides: Partial<CourseRow> = {},
): Promise<CourseRow> {
  const row: CourseRow = {
    partitionKey: USER_ID,
    rowKey: COURSE_ID,
    user_id: USER_ID,
    year_id: "year-2026",
    name: "French 🇫🇷",
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

const validBody = {
  courseId: COURSE_ID,
  cards: CARD_INPUTS,
};

describe("POST /api/cards/batch", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("AC1: returns 401 when no cookie", async () => {
    const res = await makeCardsBatchHandler(deps)(makeReq(null, validBody), ctx);
    expect(res.status).toBe(401);
  });

  it("AC2: returns 405 for non-POST method", async () => {
    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody, "GET"), ctx);
    expect(res.status).toBe(405);
  });

  it("AC3: returns 400 when body is missing", async () => {
    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), undefined), ctx);
    expect(res.status).toBe(400);
  });

  it("AC4: returns 400 when courseId is missing", async () => {
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { cards: CARD_INPUTS }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC5: returns 400 when cards is not an array", async () => {
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, cards: "not-array" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC6: returns 400 when cards array is empty", async () => {
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, cards: [] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC7: returns 400 when a card is missing question", async () => {
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, cards: [{ answer: "x", distractors: [] }] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC8: returns 400 when a card is missing answer", async () => {
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, cards: [{ question: "x", distractors: [] }] }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC9: returns 404 when course not found", async () => {
    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(404);
  });

  it("AC10: returns 403 when caller is not owner and not admin", async () => {
    await seedCourse(deps);
    await seedUser(deps, USER_ID);

    const otherToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeCardsBatchHandler(deps)(makeReq(otherCookie, validBody), ctx);
    expect(res.status).toBe(403);
  });

  it("AC11: owner creates all cards, returns 201 with created profiles", async () => {
    await seedCourse(deps);

    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);

    const body = res.jsonBody as Record<string, unknown>;
    expect(Array.isArray(body.cards)).toBe(true);
    expect((body.cards as unknown[]).length).toBe(2);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(stored.length).toBe(2);
  });

  it("AC12: admin can batch-create cards for any course", async () => {
    await seedUser(deps, USER_ID);
    await seedCourse(deps);

    const res = await makeCardsBatchHandler(deps)(makeReq(adminCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);
  });

  it("AC13: cards are created with source=ai_import and correct SM-2 defaults", async () => {
    await seedCourse(deps);

    await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    for (const card of stored) {
      expect(card.source).toBe("ai_import");
      expect(card.sm2_ease).toBe(2.5);
      expect(card.sm2_interval).toBe(0);
      expect(card.sm2_reps).toBe(0);
      expect(card.next_review_at).toBe(NOW);
    }
  });

  it("AC14: cards store distractors from the input", async () => {
    await seedCourse(deps);

    await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const dogCard = stored.find((c) => c.question === "le chien");
    expect(dogCard?.distractors).toEqual(["the cat", "the bird"]);
  });

  it("AC15: null method treated as POST", async () => {
    await seedCourse(deps);

    const req = { ...makeReq(validCookie(deps), validBody), method: null } as unknown as HttpRequest;
    const res = await makeCardsBatchHandler(deps)(req, ctx);
    expect(res.status).toBe(201);
  });

  it("AC16: card without distractors defaults to empty array", async () => {
    await seedCourse(deps);

    const body = { courseId: COURSE_ID, cards: [{ question: "Q", answer: "A" }] };
    await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), body), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(stored[0]?.distractors).toEqual([]);
  });

  it("AC18: stamps a single upload_id on every card created in one batch", async () => {
    await seedCourse(deps);

    await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(stored.length).toBe(2);
    const uploadIds = new Set(stored.map((c) => c.upload_id));
    expect(uploadIds.size).toBe(1);
    const onlyUploadId = [...uploadIds][0];
    expect(typeof onlyUploadId).toBe("string");
    expect(onlyUploadId).not.toBeNull();
  });

  it("AC19: response body includes upload_id alongside created cards", async () => {
    await seedCourse(deps);

    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);

    const body = res.jsonBody as Record<string, unknown>;
    expect(typeof body.upload_id).toBe("string");
    expect((body.upload_id as string).length).toBeGreaterThan(0);

    // Every returned card profile carries the same upload_id
    const cards = body.cards as Array<{ upload_id: string | null }>;
    for (const c of cards) {
      expect(c.upload_id).toBe(body.upload_id);
    }
  });

  it("AC20: each batch request mints a fresh upload_id", async () => {
    await seedCourse(deps);

    const res1 = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const res2 = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const id1 = (res1.jsonBody as { upload_id: string }).upload_id;
    const id2 = (res2.jsonBody as { upload_id: string }).upload_id;
    expect(id1).not.toBe(id2);
  });

  it("AC21: persists question_lang and answer_lang from batch input", async () => {
    await seedCourse(deps);

    const body = {
      courseId: COURSE_ID,
      cards: [
        { question: "the dog", answer: "le chien", question_lang: "en", answer_lang: "fr-FR" },
      ],
    };
    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), body), ctx);
    expect(res.status).toBe(201);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(stored[0].question_lang).toBe("en");
    expect(stored[0].answer_lang).toBe("fr-FR");

    const resBody = res.jsonBody as { cards: Array<{ question_lang: string | null; answer_lang: string | null }> };
    expect(resBody.cards[0].question_lang).toBe("en");
    expect(resBody.cards[0].answer_lang).toBe("fr-FR");
  });

  it("AC22: batch input without per-side lang defaults to null", async () => {
    await seedCourse(deps);

    const res = await makeCardsBatchHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    for (const card of stored) {
      expect(card.question_lang ?? null).toBeNull();
      expect(card.answer_lang ?? null).toBeNull();
    }
  });

  it("AC17: skips caller's own row during cross-user scan (continue branch)", async () => {
    // Seed u-mats first so scanner hits caller's row before owner's row
    await seedUser(deps, "u-mats");
    await seedUser(deps, USER_ID);
    await seedCourse(deps); // owned by u-lex

    const matsToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const matsCookie = buildSessionCookie(matsToken);

    const res = await makeCardsBatchHandler(deps)(makeReq(matsCookie, validBody), ctx);
    expect(res.status).toBe(403); // u-mats is not the owner — scan ran and found the course
  });

  it("creates only forward cards when bidirectional is false or omitted", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { ...validBody, bidirectional: false }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.jsonBody as { cards: unknown[] };
    expect(body.cards).toHaveLength(2); // only forward cards
    const allRows = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(allRows).toHaveLength(2);
  });

  it("creates a forward + reverse pair for each input when bidirectional=true", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { ...validBody, bidirectional: true }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.jsonBody as { cards: { reverse_of: string | null }[] };
    expect(body.cards).toHaveLength(4); // 2 forward + 2 reverse
    const allRows = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(allRows).toHaveLength(4);
  });

  it("bidirectional=true response includes both forward and reverse profiles", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { ...validBody, bidirectional: true }),
      ctx,
    );
    const body = res.jsonBody as { cards: { reverse_of: string | null; source: string }[] };
    const forwards = body.cards.filter((c) => c.reverse_of === null);
    const reverses = body.cards.filter((c) => c.reverse_of !== null);
    expect(forwards).toHaveLength(2);
    expect(reverses).toHaveLength(2);
    for (const rev of reverses) {
      expect(rev.source).toBe("reverse");
    }
  });

  it("pipe-alternative rule applies on the reverse when bidirectional=true", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const pipeInput = [
      { question: "the dog", answer: "le chien|le chiot" },
    ];
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, cards: pipeInput, bidirectional: true }),
      ctx,
    );
    const body = res.jsonBody as { cards: { question: string; answer: string; reverse_of: string | null }[] };
    const rev = body.cards.find((c) => c.reverse_of !== null);
    expect(rev).toBeDefined();
    expect(rev!.question).toBe("le chien");
    expect(rev!.answer).toBe("the dog");
  });

  it("stores upload_name on created cards when uploadName provided", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), { ...validBody, uploadName: "Chapter 3" }),
      ctx,
    );
    const body = res.jsonBody as { cards: { upload_name: string | null }[] };
    expect(body.cards[0]?.upload_name).toBe("Chapter 3");
    expect(body.cards[1]?.upload_name).toBe("Chapter 3");
  });

  it("upload_name defaults to null when not provided", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeCardsBatchHandler(deps)(
      makeReq(validCookie(deps), validBody),
      ctx,
    );
    const body = res.jsonBody as { cards: { upload_name: string | null }[] };
    expect(body.cards[0]?.upload_name).toBeNull();
  });
});

describe("PATCH /api/cards/upload-name", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  function makeRenameReq(cookie: string | null, body: unknown): HttpRequest {
    return {
      method: "PATCH",
      url: "http://local/api/cards/upload-name",
      params: {},
      headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
      query: { get: () => null },
      json: async () => body,
    } as unknown as HttpRequest;
  }

  it("renames all cards in an upload group", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    // Create cards with an upload_id
    const card1: CardRow = {
      partitionKey: COURSE_ID, rowKey: "c1", course_id: COURSE_ID,
      question: "Q1", answer: "A1", distractors: [], hint: null, source: "ai_import",
      sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0,
      next_review_at: NOW, created_at: NOW, upload_id: "up-1", upload_name: null,
    };
    const card2: CardRow = { ...card1, rowKey: "c2", question: "Q2", answer: "A2" };
    await deps.tables.upsert<CardRow>("cards", card1);
    await deps.tables.upsert<CardRow>("cards", card2);

    const res = await makeUploadRenameHandler(deps)(
      makeRenameReq(validCookie(deps), { courseId: COURSE_ID, uploadId: "up-1", uploadName: "Chapter 5" }),
      {} as InvocationContext,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { updated: number }).updated).toBe(2);

    const cards = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(cards[0]?.upload_name).toBe("Chapter 5");
    expect(cards[1]?.upload_name).toBe("Chapter 5");
  });

  it("returns 401 without auth", async () => {
    const res = await makeUploadRenameHandler(deps)(
      makeRenameReq(null, { courseId: COURSE_ID, uploadId: "up-1", uploadName: "X" }),
      {} as InvocationContext,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when uploadName is missing", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeUploadRenameHandler(deps)(
      makeRenameReq(validCookie(deps), { courseId: COURSE_ID, uploadId: "up-1" }),
      {} as InvocationContext,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated=0 for non-existent uploadId", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    const res = await makeUploadRenameHandler(deps)(
      makeRenameReq(validCookie(deps), { courseId: COURSE_ID, uploadId: "ghost", uploadName: "X" }),
      {} as InvocationContext,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { updated: number }).updated).toBe(0);
  });
});
