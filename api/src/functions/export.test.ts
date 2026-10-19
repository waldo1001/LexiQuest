import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeExportHandler, type ExportDeps } from "./export.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../../testing/session-cookie.js";
import { bodyOf, headersOf } from "../../testing/http.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const USER_A = "u-lex";
const USER_B = "u-mats";

function makeReq(cookie: string | null, query: Record<string, string> = {}): HttpRequest {
  return {
    method: "GET",
    url: "http://local/api/export",
    params: {},
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => query[k] ?? null },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): ExportDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>, userId = USER_A, isAdmin = false) {
  const token = deps.signer.sign({ userId, isAdmin, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage, userId: string, overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    name: userId === USER_A ? "Lex" : "Mats",
    password_hash: "secret-hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 20, streak: 0, total_xp: 0, badges: [] },
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  tables.upsert("users", row);
  return row;
}

describe("GET /api/export", () => {
  it("EX-1: returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(null), ctx);
    expect(res.status).toBe(401);
  });

  it("EX-2: returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeExportHandler(deps);
    const req = { ...makeReq(validCookie(deps)), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("EX-3: returns own data as JSON with user, courses, cards, sessions, attempts", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(res.status).toBe(200);
    const body = bodyOf(res) as Record<string, unknown>;
    expect(body).toHaveProperty("user");
    expect(body).toHaveProperty("courses");
    expect(body).toHaveProperty("cards");
    expect(body).toHaveProperty("sessions");
    expect(body).toHaveProperty("attempts");
  });

  it("EX-4: password_hash is never included in export", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    const serialized = JSON.stringify(bodyOf(res));
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("secret-hash");
  });

  it("EX-4b: includes cards from each of the user's courses", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const course: CourseRow = {
      partitionKey: USER_A,
      rowKey: "course-1",
      user_id: USER_A,
      year_id: "y1",
      name: "French",
      emoji: "🇫🇷",
      color: "#16a34a",
      language: "fr-FR",
      default_mode: "self_grade",
      created_at: NOW,
    };
    deps.tables.upsert<CourseRow>("courses", course);
    const card: CardRow = {
      partitionKey: "course-1",
      rowKey: "card-1",
      course_id: "course-1",
      question: "le chien",
      answer: "the dog",
      distractors: [],
      hint: null,
      source: "manual",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: NOW,
      created_at: NOW,
    };
    deps.tables.upsert<CardRow>("cards", card);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(res.status).toBe(200);
    const body = bodyOf(res) as { cards: unknown[] };
    expect(body.cards).toHaveLength(1);
  });

  it("EX-5: non-admin cannot export another user's data (403)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    seedUser(deps.tables, USER_B);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps, USER_A, false), { userId: USER_B }), ctx);
    expect(res.status).toBe(403);
  });

  it("EX-6: admin can export any user's data via ?userId=", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, { is_admin: true });
    seedUser(deps.tables, USER_B);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps, USER_A, true), { userId: USER_B }), ctx);
    expect(res.status).toBe(200);
    const body = bodyOf(res) as { user: { userId: string } };
    expect(body.user.userId).toBe(USER_B);
  });

  it("EX-7: user row in export has userId, name, color but no password_hash", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    const body = bodyOf(res) as { user: Record<string, unknown> };
    expect(body.user.userId).toBe(USER_A);
    expect(body.user.name).toBe("Lex");
    expect(body.user).not.toHaveProperty("password_hash");
  });

  it("EX-8: sets Content-Disposition attachment header", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A);
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps)), ctx);
    expect(headersOf(res)["Content-Disposition"]).toMatch(/attachment; filename=/);
  });

  it("EX-9: admin requesting a non-existent userId gets 404", async () => {
    const deps = makeDeps();
    seedUser(deps.tables, USER_A, { is_admin: true });
    const handler = makeExportHandler(deps);
    const res = await handler(makeReq(validCookie(deps, USER_A, true), { userId: "u-ghost" }), ctx);
    expect(res.status).toBe(404);
  });
});
