import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeCardsIdHandler, type CardsIdDeps } from "./cards-id.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { UserRow } from "../shared/seed.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";

function makeReq(
  cookie: string | null,
  opts: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
    params?: Record<string, string>;
  } = {},
): HttpRequest {
  const { method = "PUT", body, query = {}, params = {} } = opts;
  return {
    method,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
    query: {
      get(name: string) {
        return query[name] ?? null;
      },
    },
    params,
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

const OWNER_ID = "u-lex";
const OTHER_ID = "u-mats";
const ADMIN_ID = "u-waldo";
const COURSE_ID = "course-french";
const CARD_ID = "card-1";

function makeUser(userId: string, isAdmin = false): UserRow {
  return {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    name: isAdmin ? "Waldo" : "Lex",
    password_hash: "hash:password",
    color: "#2563eb",
    avatar_emoji: "🦊",
    ui_language: "en",
    is_admin: isAdmin,
    settings: "{}",
    created_at: "2026-04-22T09:00:00.000Z",
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
    color: "#2563eb",
    language: "fr-FR",
    default_mode: "ask",
    created_at: "2026-04-22T09:00:00.000Z",
  };
}

function makeCard(
  courseId: string,
  cardId: string,
  overrides: Partial<CardRow> = {},
): CardRow {
  return {
    partitionKey: courseId,
    rowKey: cardId,
    course_id: courseId,
    question: "What is a dog?",
    answer: "le chien",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00.000Z",
    created_at: "2026-04-22T09:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(): CardsIdDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  return { tables, signer, clock };
}

function validCookie(
  deps: { signer: FakeSessionSigner; clock: FakeClock },
  userId = OWNER_ID,
  isAdmin = false,
): string {
  const token = deps.signer.sign({
    userId,
    isAdmin,
    expMs: deps.clock.nowMs() + 60_000,
  });
  return buildSessionCookie(token);
}

// -----------------------------------------------------------------
// PUT /api/cards/:id?courseId=
// -----------------------------------------------------------------
describe("PUT /api/cards/:id", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(async () => {
    deps = makeDeps();
    await deps.tables.upsert("users", makeUser(OWNER_ID, false));
    await deps.tables.upsert("users", makeUser(OTHER_ID, false));
    await deps.tables.upsert("users", makeUser(ADMIN_ID, true));
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID));
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(null, { method: "PUT", params: { id: CARD_ID }, query: { courseId: COURSE_ID } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 when courseId query param is missing", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps), { method: "PUT", params: { id: CARD_ID }, body: { question: "Updated?" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when card does not exist", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps), {
        method: "PUT",
        params: { id: "nonexistent" },
        query: { courseId: COURSE_ID },
        body: { question: "Updated?" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the course owner", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OTHER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "Updated?" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("owner can update card fields", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "Updated question?", answer: "la maison" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as { question: string; answer: string };
    expect(body.question).toBe("Updated question?");
    expect(body.answer).toBe("la maison");
  });

  it("admin can update another owner's card", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, ADMIN_ID, true), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "Admin updated?" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
  });

  it("persists updated fields to storage", async () => {
    await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "Persisted?" },
      }),
      ctx,
    );
    const stored = await deps.tables.getById<CardRow>("cards", COURSE_ID, CARD_ID);
    expect(stored?.question).toBe("Persisted?");
  });

  it("PUT preserves upload_id when editing a batch-imported card", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "card-batched", {
      upload_id: "upload-xyz",
      source: "ai_import",
    }));

    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: "card-batched" },
        query: { courseId: COURSE_ID },
        body: { question: "edited" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as { upload_id: string | null };
    expect(body.upload_id).toBe("upload-xyz");

    const stored = await deps.tables.getById<CardRow>("cards", COURSE_ID, "card-batched");
    expect(stored?.upload_id).toBe("upload-xyz");
  });

  it("PUT merges question_lang and answer_lang from patch", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question_lang: "en", answer_lang: "fr-FR" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as { question_lang: string | null; answer_lang: string | null };
    expect(body.question_lang).toBe("en");
    expect(body.answer_lang).toBe("fr-FR");

    const stored = await deps.tables.getById<CardRow>("cards", COURSE_ID, CARD_ID);
    expect(stored?.question_lang).toBe("en");
    expect(stored?.answer_lang).toBe("fr-FR");
  });

  it("PUT preserves existing per-side lang when patch omits them", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID, {
      question_lang: "nl",
      answer_lang: "fr",
    }));
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "New Q?" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as { question_lang: string | null; answer_lang: string | null };
    expect(body.question_lang).toBe("nl");
    expect(body.answer_lang).toBe("fr");
  });

  it("returns 400 on invalid patch body", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "" }, // empty question
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });
});

// -----------------------------------------------------------------
// Edge cases (method guard, malformed body, orphaned card)
// -----------------------------------------------------------------
describe("cards-id edge cases", () => {
  it("returns 405 for unsupported method", async () => {
    const localDeps = makeDeps();
    await localDeps.tables.upsert("users", makeUser(OWNER_ID, false));
    await localDeps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
    await localDeps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID));
    const res = (await makeCardsIdHandler(localDeps)(
      makeReq(validCookie(localDeps), { method: "PATCH", params: { id: CARD_ID }, query: { courseId: COURSE_ID } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 400 when PUT body fails JSON parse", async () => {
    const localDeps = makeDeps();
    await localDeps.tables.upsert("users", makeUser(OWNER_ID, false));
    await localDeps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
    await localDeps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID));
    const reqWithBadJson = {
      method: "PUT",
      headers: { get: (n: string) => n === "cookie" ? validCookie(localDeps) : null },
      query: { get: (n: string) => n === "courseId" ? COURSE_ID : null },
      params: { id: CARD_ID },
      json: async () => { throw new Error("bad json"); },
    } as unknown as import("@azure/functions").HttpRequest;
    const res = (await makeCardsIdHandler(localDeps)(reqWithBadJson, ctx)) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when id path param is missing", async () => {
    const localDeps = makeDeps();
    await localDeps.tables.upsert("users", makeUser(OWNER_ID, false));
    const res = (await makeCardsIdHandler(localDeps)(
      makeReq(validCookie(localDeps), { method: "PUT", params: {}, query: { courseId: COURSE_ID } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when card exists but course row is missing", async () => {
    const localDeps = makeDeps();
    await localDeps.tables.upsert("users", makeUser(OWNER_ID, false));
    await localDeps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID));
    // deliberately NOT seeding any course row
    const res = (await makeCardsIdHandler(localDeps)(
      makeReq(validCookie(localDeps), {
        method: "PUT",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
        body: { question: "Updated?" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });
});

// -----------------------------------------------------------------
// DELETE /api/cards/:id?courseId=
// -----------------------------------------------------------------
describe("DELETE /api/cards/:id", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(async () => {
    deps = makeDeps();
    await deps.tables.upsert("users", makeUser(OWNER_ID, false));
    await deps.tables.upsert("users", makeUser(OTHER_ID, false));
    await deps.tables.upsert("users", makeUser(ADMIN_ID, true));
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, CARD_ID));
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(null, { method: "DELETE", params: { id: CARD_ID }, query: { courseId: COURSE_ID } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 when courseId query param is missing", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps), { method: "DELETE", params: { id: CARD_ID } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when card does not exist", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps), {
        method: "DELETE",
        params: { id: "nonexistent" },
        query: { courseId: COURSE_ID },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the course owner", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OTHER_ID), {
        method: "DELETE",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("owner can delete card and it is removed from storage", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "DELETE",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(204);
    const stored = await deps.tables.getById("cards", COURSE_ID, CARD_ID);
    expect(stored).toBeNull();
  });

  it("admin can delete another owner's card", async () => {
    const res = (await makeCardsIdHandler(deps)(
      makeReq(validCookie(deps, ADMIN_ID, true), {
        method: "DELETE",
        params: { id: CARD_ID },
        query: { courseId: COURSE_ID },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(204);
  });
});
