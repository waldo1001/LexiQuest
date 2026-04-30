import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsCopyHandler, type CardsCopyDeps } from "./cards-copy.js";
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
const NOW = "2026-04-30T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";
const SOURCE_UPLOAD_ID = "upload-A";
const TARGET_UPLOAD_ID = "upload-B";
const THIRD_UPLOAD_ID = "upload-C";

const SCRIPTED_UUIDS = [
  "new-1", "new-2", "new-3", "new-4", "new-5",
  "new-6", "new-7", "new-8", "new-9", "new-10",
];

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    url: "http://local/api/cards/copy",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

function makeDeps(): CardsCopyDeps & {
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

function cardOf(overrides: Partial<CardRow> & Pick<CardRow, "rowKey" | "question" | "answer" | "upload_id">): CardRow {
  return {
    partitionKey: COURSE_ID,
    course_id: COURSE_ID,
    distractors: [],
    hint: null,
    source: "ai_import",
    sm2_ease: 2.6, // non-default to verify reset
    sm2_interval: 7,
    sm2_reps: 3,
    next_review_at: "2026-05-15T00:00:00.000Z",
    created_at: "2026-04-01T00:00:00.000Z",
    upload_name: "Source Pack",
    question_lang: null,
    answer_lang: null,
    reverse_of: null,
    ...overrides,
  } as CardRow;
}

async function seedCards(deps: ReturnType<typeof makeDeps>, cards: CardRow[]): Promise<void> {
  for (const c of cards) {
    await deps.tables.upsert<CardRow>("cards", c);
  }
}

async function seedTwoUploads(deps: ReturnType<typeof makeDeps>): Promise<void> {
  await seedCards(deps, [
    cardOf({ rowKey: "src-1", question: "le chien", answer: "the dog", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
    cardOf({ rowKey: "src-2", question: "la maison", answer: "the house", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
    cardOf({ rowKey: "tgt-1", question: "existing q", answer: "existing a", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
  ]);
}

const validBody = {
  courseId: COURSE_ID,
  sourceUploadId: SOURCE_UPLOAD_ID,
  targetUploadId: TARGET_UPLOAD_ID,
};

describe("POST /api/cards/copy", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("rejects non-POST with 405", async () => {
    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody, "GET"), ctx);
    expect(res.status).toBe(405);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await makeCardsCopyHandler(deps)(makeReq(null, validBody), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing", async () => {
    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), undefined), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when courseId is missing", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { sourceUploadId: SOURCE_UPLOAD_ID, targetUploadId: TARGET_UPLOAD_ID }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourceUploadId is missing", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, targetUploadId: TARGET_UPLOAD_ID }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetUploadId is missing", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, sourceUploadId: SOURCE_UPLOAD_ID }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when sourceUploadId equals targetUploadId", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, sourceUploadId: "u-1", targetUploadId: "u-1" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when fields are empty strings", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { courseId: "", sourceUploadId: "", targetUploadId: "" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when course does not exist", async () => {
    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is neither owner nor admin", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    await seedTwoUploads(deps);

    const otherToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeCardsCopyHandler(deps)(makeReq(otherCookie, validBody), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when sourceUploadId is not present in the course", async () => {
    await seedCourse(deps);
    // Only seed target upload — source upload doesn't exist
    await seedCards(deps, [
      cardOf({ rowKey: "tgt-1", question: "x", answer: "y", upload_id: TARGET_UPLOAD_ID }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetUploadId is not present in the course", async () => {
    await seedCourse(deps);
    // Only seed source upload — target upload doesn't exist
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "x", answer: "y", upload_id: SOURCE_UPLOAD_ID }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(400);
  });

  it("copies all forward cards from source to target with new ids, returns 201", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);

    const body = res.jsonBody as { copied: number; skipped: number; copied_card_ids: string[] };
    expect(body.copied).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.copied_card_ids).toHaveLength(2);
    // IDs must be freshly minted, not reused from source
    expect(body.copied_card_ids).not.toContain("src-1");
    expect(body.copied_card_ids).not.toContain("src-2");

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    // 2 source + 1 pre-existing target + 2 new copies = 5
    expect(stored).toHaveLength(5);
  });

  it("assigns target's upload_id and upload_name to copied cards", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const copies = stored.filter((c) => c.rowKey !== "src-1" && c.rowKey !== "src-2" && c.rowKey !== "tgt-1");
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(c.upload_id).toBe(TARGET_UPLOAD_ID);
      expect(c.upload_name).toBe("Target Pack");
    }
  });

  it("resets sm2 fields and timestamps on copies", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const copies = stored.filter((c) => c.upload_id === TARGET_UPLOAD_ID && c.rowKey !== "tgt-1");
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(c.sm2_ease).toBe(2.5);
      expect(c.sm2_interval).toBe(0);
      expect(c.sm2_reps).toBe(0);
      expect(c.next_review_at).toBe(NOW);
      expect(c.created_at).toBe(NOW);
    }
  });

  it("preserves source field, hint, distractors, and per-side languages on copies", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({
        rowKey: "src-1",
        question: "le chien",
        answer: "the dog",
        upload_id: SOURCE_UPLOAD_ID,
        upload_name: "Source Pack",
        hint: "animal",
        distractors: ["the cat", "the bird"],
        question_lang: "fr-FR",
        answer_lang: "en",
        source: "photo",
      }),
      cardOf({ rowKey: "tgt-1", question: "existing", answer: "x", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const copy = stored.find((c) => c.upload_id === TARGET_UPLOAD_ID && c.question === "le chien");
    expect(copy).toBeDefined();
    expect(copy!.hint).toBe("animal");
    expect(copy!.distractors).toEqual(["the cat", "the bird"]);
    expect(copy!.question_lang).toBe("fr-FR");
    expect(copy!.answer_lang).toBe("en");
    expect(copy!.source).toBe("photo");
    expect(copy!.reverse_of ?? null).toBeNull();
  });

  it("skips source cards whose question already exists in target (case-insensitive)", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "le chien", answer: "the dog", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "src-2", question: "la maison", answer: "the house", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "tgt-1", question: "LE CHIEN", answer: "different", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const body = res.jsonBody as { copied: number; skipped: number };
    expect(body.copied).toBe(1);
    expect(body.skipped).toBe(1);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const targetQuestions = stored.filter((c) => c.upload_id === TARGET_UPLOAD_ID).map((c) => c.question);
    // Original target card unchanged ("LE CHIEN"), only "la maison" was copied
    expect(targetQuestions).toContain("LE CHIEN");
    expect(targetQuestions).toContain("la maison");
    expect(targetQuestions.filter((q) => q.toLowerCase() === "le chien")).toHaveLength(1);
  });

  it("normalizes whitespace and trim when comparing questions", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "  Hello   world  ", answer: "x", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "tgt-1", question: "hello world", answer: "y", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const body = res.jsonBody as { copied: number; skipped: number };
    expect(body.copied).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("dedup ignores answer differences (same Q, different A → still skipped)", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "Q", answer: "answer one", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "tgt-1", question: "Q", answer: "answer two", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect((res.jsonBody as { copied: number }).copied).toBe(0);
    expect((res.jsonBody as { skipped: number }).skipped).toBe(1);
  });

  it("dedup is scoped to target upload only (same Q in a third upload does not block)", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "le chien", answer: "the dog", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "tgt-1", question: "different", answer: "x", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
      cardOf({ rowKey: "third-1", question: "le chien", answer: "y", upload_id: THIRD_UPLOAD_ID, upload_name: "Third Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect((res.jsonBody as { copied: number }).copied).toBe(1);
    expect((res.jsonBody as { skipped: number }).skipped).toBe(0);
  });

  it("skips reverse cards (reverse_of != null) from the source", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-fwd", question: "le chien", answer: "the dog", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "src-rev", question: "the dog", answer: "le chien", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack", source: "reverse", reverse_of: "src-fwd" }),
      cardOf({ rowKey: "tgt-1", question: "irrelevant", answer: "x", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const body = res.jsonBody as { copied: number; skipped: number };
    expect(body.copied).toBe(1);
    // The reverse is not copied AND not counted as a skip — it's filtered out before dedup
    expect(body.skipped).toBe(0);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const targetCards = stored.filter((c) => c.upload_id === TARGET_UPLOAD_ID);
    expect(targetCards).toHaveLength(2); // tgt-1 + 1 copy
    for (const c of targetCards) {
      expect(c.reverse_of ?? null).toBeNull();
    }
  });

  it("dedups within the source upload itself (same Q twice → only one copy)", async () => {
    await seedCourse(deps);
    await seedCards(deps, [
      cardOf({ rowKey: "src-1", question: "Hello", answer: "A", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "src-2", question: "hello", answer: "B", upload_id: SOURCE_UPLOAD_ID, upload_name: "Source Pack" }),
      cardOf({ rowKey: "tgt-1", question: "different", answer: "x", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const body = res.jsonBody as { copied: number; skipped: number };
    expect(body.copied).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("returned copied_card_ids match the rowKeys of the actually-upserted new cards", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    const body = res.jsonBody as { copied_card_ids: string[] };

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const newCards = stored.filter(
      (c) => c.upload_id === TARGET_UPLOAD_ID && c.rowKey !== "tgt-1",
    );
    const newRowKeys = newCards.map((c) => c.rowKey).sort();
    expect([...body.copied_card_ids].sort()).toEqual(newRowKeys);
  });

  it("admin can copy on a course they do not own", async () => {
    await seedUser(deps);
    await seedCourse(deps);
    await seedTwoUploads(deps);

    const res = await makeCardsCopyHandler(deps)(makeReq(adminCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);
    expect((res.jsonBody as { copied: number }).copied).toBe(2);
  });

  it("does not modify source cards or target's pre-existing cards", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const src1 = stored.find((c) => c.rowKey === "src-1");
    const src2 = stored.find((c) => c.rowKey === "src-2");
    const tgt1 = stored.find((c) => c.rowKey === "tgt-1");

    expect(src1?.upload_id).toBe(SOURCE_UPLOAD_ID);
    expect(src2?.upload_id).toBe(SOURCE_UPLOAD_ID);
    expect(tgt1?.upload_id).toBe(TARGET_UPLOAD_ID);
    expect(tgt1?.question).toBe("existing q");
    expect(tgt1?.answer).toBe("existing a");
  });

  it("null method is treated as POST", async () => {
    await seedCourse(deps);
    await seedTwoUploads(deps);

    const req = { ...makeReq(validCookie(deps), validBody), method: null } as unknown as HttpRequest;
    const res = await makeCardsCopyHandler(deps)(req, ctx);
    expect(res.status).toBe(201);
  });

  it("rejects non-string fields with 400", async () => {
    const res = await makeCardsCopyHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, sourceUploadId: 42, targetUploadId: TARGET_UPLOAD_ID }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("skips caller's own row during cross-user scan (continue branch)", async () => {
    // Seed u-mats first so scanner hits caller's row before the owner's row.
    await seedUser(deps, "u-mats");
    await seedUser(deps, USER_ID);
    await seedCourse(deps); // owned by u-lex
    await seedTwoUploads(deps);

    const matsToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const matsCookie = buildSessionCookie(matsToken);

    const res = await makeCardsCopyHandler(deps)(makeReq(matsCookie, validBody), ctx);
    expect(res.status).toBe(403); // u-mats is not the owner — scan ran and found the course
  });

  it("copies a source card whose distractors field is absent (defaults to empty array)", async () => {
    await seedCourse(deps);
    // Build a card without the distractors field (forced through `as unknown`).
    const cardWithoutDistractors = {
      partitionKey: COURSE_ID,
      rowKey: "src-1",
      course_id: COURSE_ID,
      question: "Q",
      answer: "A",
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: NOW,
      created_at: NOW,
      upload_id: SOURCE_UPLOAD_ID,
      upload_name: "Source Pack",
      reverse_of: null,
    } as unknown as CardRow;
    await deps.tables.upsert<CardRow>("cards", cardWithoutDistractors);
    await seedCards(deps, [
      cardOf({ rowKey: "tgt-1", question: "different", answer: "x", upload_id: TARGET_UPLOAD_ID, upload_name: "Target Pack" }),
    ]);

    const res = await makeCardsCopyHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(201);

    const stored = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const copy = stored.find((c) => c.upload_id === TARGET_UPLOAD_ID && c.question === "Q");
    expect(copy).toBeDefined();
    expect(copy!.distractors).toEqual([]);
  });
});
