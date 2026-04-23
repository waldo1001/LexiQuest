import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsEnrichHandler, type CardsEnrichDeps } from "./cards-enrich.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeClaudeClient } from "../../testing/fake-claude-client.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    url: "http://local/api/cards/enrich",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

function makeDeps(): CardsEnrichDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  claude: FakeClaudeClient;
} {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  const claude = new FakeClaudeClient();
  return { tables, signer, clock, claude };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_ID): string {
  const token = deps.signer.sign({ userId, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function adminCookie(deps: ReturnType<typeof makeDeps>): string {
  const token = deps.signer.sign({ userId: "u-admin", isAdmin: true, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

async function seedCourse(deps: ReturnType<typeof makeDeps>): Promise<CourseRow> {
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
    settings: JSON.stringify({}),
    created_at: NOW,
  };
  await deps.tables.upsert<UserRow>("users", row);
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

const ENRICH_RESPONSE = [
  { id: "card-1", distractors: ["wrong1", "wrong2"] as [string, string] },
  { id: "card-2", distractors: ["wrong3", "wrong4"] as [string, string] },
];

describe("POST /api/cards/enrich", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("AC1: returns 401 when no cookie", async () => {
    const res = await makeCardsEnrichHandler(deps)(makeReq(null, { courseId: COURSE_ID }), ctx);
    expect(res.status).toBe(401);
  });

  it("AC2: returns 405 for non-POST method", async () => {
    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }, "GET"),
      ctx,
    );
    expect(res.status).toBe(405);
  });

  it("AC3: returns 400 when body is missing", async () => {
    const res = await makeCardsEnrichHandler(deps)(makeReq(validCookie(deps), undefined), ctx);
    expect(res.status).toBe(400);
  });

  it("AC4: returns 400 when courseId is missing", async () => {
    const res = await makeCardsEnrichHandler(deps)(makeReq(validCookie(deps), {}), ctx);
    expect(res.status).toBe(400);
  });

  it("AC5: returns 404 when course not found", async () => {
    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("AC6: returns 403 when caller is not owner and not admin", async () => {
    await seedCourse(deps);
    await seedUser(deps, USER_ID);

    const otherToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeCardsEnrichHandler(deps)(
      makeReq(otherCookie, { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("AC7: returns 200 with enriched=0 when all cards already have distractors", async () => {
    await seedCourse(deps);
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1", { distractors: ["a", "b"] }));

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).enriched).toBe(0);
    // Claude should NOT be called if no cards need enrichment
    expect(deps.claude.enrichInputs).toHaveLength(0);
  });

  it("AC8: enriches cards missing distractors and updates storage", async () => {
    await seedCourse(deps);
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2"));
    deps.claude.nextEnrich = ENRICH_RESPONSE;

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).enriched).toBe(2);

    const card1 = await deps.tables.getById<CardRow>("cards", COURSE_ID, "card-1");
    expect(card1?.distractors).toEqual(["wrong1", "wrong2"]);
    const card2 = await deps.tables.getById<CardRow>("cards", COURSE_ID, "card-2");
    expect(card2?.distractors).toEqual(["wrong3", "wrong4"]);
  });

  it("AC9: skips cards that already have distractors when building enrich input", async () => {
    await seedCourse(deps);
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1")); // no distractors
    await deps.tables.upsert<CardRow>("cards", makeCard("card-2", { distractors: ["a", "b"] })); // already enriched
    deps.claude.nextEnrich = [{ id: "card-1", distractors: ["x", "y"] as [string, string] }];

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).enriched).toBe(1);

    const input = deps.claude.enrichInputs[0];
    expect(input.cards).toHaveLength(1);
    expect(input.cards[0].id).toBe("card-1");
  });

  it("AC10: admin can enrich cards in any course", async () => {
    await seedUser(deps, USER_ID);
    await seedCourse(deps);
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    deps.claude.nextEnrich = [{ id: "card-1", distractors: ["x", "y"] as [string, string] }];

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(adminCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it("AC11: returns 502 when Claude throws", async () => {
    await seedCourse(deps);
    await deps.tables.upsert<CardRow>("cards", makeCard("card-1"));
    deps.claude.nextEnrichError = new Error("rate limit");

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(502);
  });

  it("AC12: null method treated as POST", async () => {
    await seedCourse(deps);

    const req = { ...makeReq(validCookie(deps), { courseId: COURSE_ID }), method: null } as unknown as HttpRequest;
    const res = await makeCardsEnrichHandler(deps)(req, ctx);
    // Returns 200 with enriched=0 (no cards to enrich)
    expect(res.status).toBe(200);
  });

  it("AC13: skips caller's own row during cross-user course scan (continue branch)", async () => {
    // Seed u-mats first (scanner hits caller before owner)
    await seedUser(deps, "u-mats");
    await seedUser(deps, USER_ID);
    await seedCourse(deps); // owned by u-lex

    const matsToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const matsCookie = buildSessionCookie(matsToken);

    const res = await makeCardsEnrichHandler(deps)(
      makeReq(matsCookie, { courseId: COURSE_ID }),
      ctx,
    );
    expect(res.status).toBe(403); // u-mats is not the owner — scan ran, continue fired
  });
});
