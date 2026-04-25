import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeCardsHandler, type CardsDeps } from "./cards.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { UserRow } from "../shared/seed.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";

function makeReq(
  cookie: string | null,
  opts: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): HttpRequest {
  const { method = "GET", body, query = {} } = opts;
  const url = new URL("http://local/api/cards");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return {
    method,
    url: url.toString(),
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
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function makeCourse(
  userId: string,
  courseId: string,
  overrides: Partial<CourseRow> = {},
): CourseRow {
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
    ...overrides,
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

function makeDeps(uuids: readonly string[] = []): CardsDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  random: FakeRandom;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  const random = new FakeRandom(uuids);
  return { tables, signer, clock, random };
}

function validCookie(
  deps: { signer: FakeSessionSigner; clock: FakeClock },
  userId = "u-lex",
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
// GET /api/cards?courseId=
// -----------------------------------------------------------------
describe("GET /api/cards", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(null, { query: { courseId: "c1" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 when courseId query param is missing", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns empty array when course has no cards", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps), { query: { courseId: "c1" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual([]);
  });

  it("returns cards for the given courseId", async () => {
    await deps.tables.upsert("cards", makeCard("c1", "card-1"));
    await deps.tables.upsert("cards", makeCard("c1", "card-2"));
    await deps.tables.upsert("cards", makeCard("c2", "card-3")); // different course
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps), { query: { courseId: "c1" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as CardRow[];
    expect(body).toHaveLength(2);
    expect(body.map((c) => c.id).sort()).toEqual(["card-1", "card-2"]);
  });

  it("any authenticated user can list another user's cards (read-only is open)", async () => {
    await deps.tables.upsert("cards", makeCard("c-mats", "card-1"));
    // u-lex is not the owner of c-mats courses, but GET is open to all authed users
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, "u-lex"), { query: { courseId: "c-mats" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as unknown[]).length).toBe(1);
  });
});

// -----------------------------------------------------------------
// POST /api/cards
// -----------------------------------------------------------------
describe("POST /api/cards", () => {
  let deps: ReturnType<typeof makeDeps>;
  const OWNER_ID = "u-lex";
  const OTHER_ID = "u-mats";
  const ADMIN_ID = "u-waldo";
  const COURSE_ID = "course-french";
  const CARD_UUID = "00000000-0000-0000-0000-000000000001";

  beforeEach(async () => {
    deps = makeDeps([CARD_UUID]);
    // Seed users + course
    await deps.tables.upsert("users", makeUser(OWNER_ID, false));
    await deps.tables.upsert("users", makeUser(OTHER_ID, false));
    await deps.tables.upsert("users", makeUser(ADMIN_ID, true));
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(null, { method: "POST", body: { course_id: COURSE_ID, question: "Q?", answer: "A" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 with missing question", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, answer: "A" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when courseId does not exist", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: "nonexistent", question: "Q?", answer: "A" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the course owner", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OTHER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "Q?", answer: "A" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("creates card with SM-2 defaults when owner posts", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "What is a dog?", answer: "le chien" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as CardRow;
    expect(body.id).toBe(CARD_UUID);
    expect(body.sm2_ease).toBe(2.5);
    expect(body.sm2_interval).toBe(0);
    expect(body.sm2_reps).toBe(0);
    expect(body.source).toBe("manual");
  });

  it("sets next_review_at to clock.now() on create", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "Q?", answer: "A" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as { next_review_at: string };
    expect(body.next_review_at).toBe("2026-04-22T09:00:00.000Z");
  });

  it("stores pipe-separated answer verbatim", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "Q?", answer: "le chien|le chiot" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as { answer: string };
    expect(body.answer).toBe("le chien|le chiot");
  });

  it("admin can create a card in another user's course", async () => {
    deps = makeDeps([CARD_UUID]);
    await deps.tables.upsert("users", makeUser(OWNER_ID, false));
    await deps.tables.upsert("users", makeUser(ADMIN_ID, true));
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, ADMIN_ID, true), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "Admin Q?", answer: "Admin A" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
  });

  it("returns 400 when GET request has no query object", async () => {
    const reqNoQuery = {
      method: "GET",
      headers: { get: (n: string) => n === "cookie" ? validCookie(deps, OWNER_ID) : null },
      query: null,
      json: async () => null,
    } as unknown as import("@azure/functions").HttpRequest;
    const res = (await makeCardsHandler(deps)(reqNoQuery, ctx)) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 405 for unsupported method (PATCH)", async () => {
    const res = (await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("persists the card row in storage", async () => {
    await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "Q?", answer: "A" },
      }),
      ctx,
    );
    const rows = await deps.tables.listByPartition("cards", COURSE_ID);
    expect(rows).toHaveLength(1);
  });

  it("POST /api/cards spawns a reverse when parent course is bidirectional", async () => {
    const biDeps = makeDeps(["card-fwd", "card-rev"]);
    await biDeps.tables.upsert("users", makeUser(OWNER_ID, false));
    await biDeps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID, { bidirectional: true }));
    const res = await makeCardsHandler(biDeps)(
      makeReq(validCookie(biDeps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "the dog", answer: "le chien" },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const rows = await biDeps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(rows).toHaveLength(2);
    const rev = rows.find((r) => r.reverse_of !== null);
    expect(rev).toBeDefined();
    expect(rev!.source).toBe("reverse");
    expect(rev!.question).toBe("le chien");
    expect(rev!.answer).toBe("the dog");
  });

  it("POST /api/cards does not spawn a reverse when parent course is not bidirectional", async () => {
    const res = await makeCardsHandler(deps)(
      makeReq(validCookie(deps, OWNER_ID), {
        method: "POST",
        body: { course_id: COURSE_ID, question: "the dog", answer: "le chien" },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const rows = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].reverse_of).toBeNull();
  });
});
