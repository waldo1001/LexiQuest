import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsBatchHandler, type CardsBatchDeps } from "./cards-batch.js";
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
});
