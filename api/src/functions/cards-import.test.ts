import { describe, it, expect, beforeEach } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeCardsImportHandler, type CardsImportDeps } from "./cards-import.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeClaudeClient } from "../../testing/fake-claude-client.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardCandidate } from "../shared/claude.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T10:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-fr";

const CANDIDATES: CardCandidate[] = [
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
    url: "http://local/api/cards/import",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: () => null },
    json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body),
  } as unknown as HttpRequest;
}

function makeDeps(): CardsImportDeps & {
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
  imageBase64: "base64data",
  mimeType: "image/jpeg",
};

describe("POST /api/cards/import", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("AC1: returns 401 when no cookie", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(null, validBody), ctx);
    expect(res.status).toBe(401);
  });

  it("AC2: returns 405 for non-POST method", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody, "GET"), ctx);
    expect(res.status).toBe(405);
  });

  it("AC3: returns 400 when body is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), undefined),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC4: returns 400 when courseId is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { imageBase64: "x", mimeType: "image/jpeg" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC5: returns 400 when imageBase64 is missing", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, mimeType: "image/jpeg" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC6: returns 400 when mimeType is invalid", async () => {
    const res = await makeCardsImportHandler(deps)(
      makeReq(validCookie(deps), { courseId: COURSE_ID, imageBase64: "x", mimeType: "text/plain" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("AC7: returns 404 when course not found", async () => {
    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(404);
  });

  it("AC8: returns 403 when caller is not owner and not admin", async () => {
    await seedCourse(deps); // owned by u-lex
    await seedUser(deps, USER_ID);

    const otherToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const otherCookie = buildSessionCookie(otherToken);
    const res = await makeCardsImportHandler(deps)(makeReq(otherCookie, validBody), ctx);
    expect(res.status).toBe(403);
  });

  it("AC9: owner gets 200 with candidates — never persists cards", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(Array.isArray(body.candidates)).toBe(true);
    expect((body.candidates as unknown[]).length).toBe(2);

    // Invariant 3: no cards persisted
    const stored = await deps.tables.listByPartition("cards", COURSE_ID);
    expect(stored.length).toBe(0);
  });

  it("AC10: admin can import to any course", async () => {
    await seedUser(deps, USER_ID); // u-lex must be in users table for cross-scan
    await seedCourse(deps); // owned by u-lex
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(adminCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
  });

  it("AC11: passes correct ExtractCardsInput to claude", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.imageBase64).toBe("base64data");
    expect(input.mimeType).toBe("image/jpeg");
    expect(input.courseName).toBe("French 🇫🇷");
    expect(input.courseLanguage).toBe("fr-FR");
  });

  it("AC12: passes caller ui_language to claude when user row exists", async () => {
    await seedCourse(deps);
    await seedUser(deps);
    deps.claude.nextCards = CANDIDATES;

    await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);

    const input = deps.claude.extractCardsInputs[0];
    expect(input.uiLanguage).toBe("en");
  });

  it("AC13: returns 422 when Claude throws ClaudeJsonParseError", async () => {
    const { ClaudeJsonParseError } = await import("../shared/claude.js");
    await seedCourse(deps);
    deps.claude.nextError = new ClaudeJsonParseError("bad json", "{{not json");

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(422);
  });

  it("AC14: returns 502 when Claude throws a generic error", async () => {
    await seedCourse(deps);
    deps.claude.nextError = new Error("rate limit");

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(502);
  });

  it("AC15: course found via cross-user scan (owner different partition)", async () => {
    await seedUser(deps, "u-mats");
    await seedCourse(deps); // owned by u-lex
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(validCookie(deps), validBody), ctx);
    expect(res.status).toBe(200);
  });

  it("AC16: treats null method as POST (method ?? 'POST' branch)", async () => {
    await seedCourse(deps);
    deps.claude.nextCards = CANDIDATES;

    const req = { ...makeReq(validCookie(deps), validBody), method: null } as unknown as HttpRequest;
    const res = await makeCardsImportHandler(deps)(req, ctx);
    expect(res.status).toBe(200);
  });

  it("AC17: skips caller's own row during cross-user scan (continue branch)", async () => {
    // u-mats is the caller; u-lex owns the course
    // Seed u-mats FIRST so the scanner hits u-mats before u-lex, triggering the continue
    await seedUser(deps, "u-mats");
    await seedUser(deps, USER_ID);
    await seedCourse(deps); // owned by u-lex

    const matsToken = deps.signer.sign({ userId: "u-mats", isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
    const matsCookie = buildSessionCookie(matsToken);
    deps.claude.nextCards = CANDIDATES;

    const res = await makeCardsImportHandler(deps)(makeReq(matsCookie, validBody), ctx);
    expect(res.status).toBe(403); // u-mats is not the owner (403), but scan did run and found the course
  });
});
