import { describe, it, expect } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { makeStatsUploadHandler, type StatsUploadDeps } from "./stats-upload.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { AttemptRow } from "./attempts-shared.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-23T12:00:00.000Z";
const USER_ID = "u-lex";
const COURSE_ID = "course-1";

function makeReq(cookie: string | null, courseId: string, range?: string): HttpRequest {
  return {
    method: "GET",
    url: `http://local/api/stats/course/${courseId}/uploads`,
    params: { courseId },
    headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) },
    query: { get: (k: string) => (k === "range" ? (range ?? null) : null) },
    json: async () => ({}),
  } as unknown as HttpRequest;
}

function makeDeps(): StatsUploadDeps & { tables: FakeTableStorage; clock: FakeClock; signer: FakeSessionSigner } {
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  const tables = new FakeTableStorage();
  return { tables, signer, clock };
}

function validCookie(deps: ReturnType<typeof makeDeps>) {
  const token = deps.signer.sign({ userId: USER_ID, isAdmin: false, expMs: deps.clock.nowMs() + 60_000 });
  return buildSessionCookie(token);
}

function seedUser(tables: FakeTableStorage): void {
  tables.upsert("users", {
    partitionKey: PARTITIONS.users,
    rowKey: USER_ID,
    name: "Lex",
    password_hash: "hash",
    is_admin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
    created_at: "2026-01-01T00:00:00.000Z",
  } satisfies UserRow);
}

function seedCourse(tables: FakeTableStorage, userId = USER_ID): void {
  tables.upsert("courses", {
    partitionKey: userId,
    rowKey: COURSE_ID,
    user_id: userId,
    year_id: "y-1",
    name: "French",
    emoji: "🇫🇷",
    color: "#000",
    language: "fr-FR",
    default_mode: "self_grade",
    created_at: "2026-01-01T00:00:00.000Z",
  } satisfies CourseRow);
}

function seedCard(tables: FakeTableStorage, rowKey: string, overrides: Partial<CardRow> = {}): void {
  tables.upsert("cards", {
    partitionKey: COURSE_ID,
    rowKey,
    course_id: COURSE_ID,
    question: `Q-${rowKey}?`,
    answer: "A",
    distractors: [],
    hint: null,
    source: "ai_import",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-23T12:00:00.000Z",
    created_at: "2026-04-20T10:00:00.000Z",
    upload_id: null,
    upload_name: null,
    ...overrides,
  } satisfies CardRow);
}

function seedAttempt(tables: FakeTableStorage, cardId: string, overrides: Partial<AttemptRow> = {}): void {
  const ts = overrides.timestamp ?? "2026-04-22T09:00:00.000Z";
  const id = overrides.rowKey ?? `${ts}_a-${cardId}-${Math.random().toString(36).slice(2, 6)}`;
  tables.upsert("attempts", {
    partitionKey: USER_ID,
    rowKey: id,
    user_id: USER_ID,
    card_id: cardId,
    session_id: "s-1",
    correct: true,
    mode: "self_grade",
    response_time_ms: 2000,
    timestamp: ts,
    ...overrides,
  } satisfies AttemptRow);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/stats/course/:courseId/uploads", () => {
  it("returns 401 without auth", async () => {
    const deps = makeDeps();
    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(null, COURSE_ID), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 405 for non-GET", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsUploadHandler(deps);
    const req = { ...makeReq(validCookie(deps), COURSE_ID), method: "POST" } as unknown as HttpRequest;
    const res = await handler(req, ctx);
    expect(res.status).toBe(405);
  });

  it("returns 404 for unknown courseId", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), "no-such-course"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns empty uploads array when course has only manual cards", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "card-1", { upload_id: null, source: "manual" });
    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    expect(res.status).toBe(200);
    expect((res.jsonBody as { uploads: unknown[] }).uploads).toEqual([]);
  });

  it("returns correct masteryDistribution per upload", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    // 3 cards in upload-A with different SM-2 states
    seedCard(deps.tables, "c1", { upload_id: "up-A", sm2_reps: 0, sm2_interval: 0 }); // new
    seedCard(deps.tables, "c2", { upload_id: "up-A", sm2_reps: 2, sm2_interval: 10 }); // young
    seedCard(deps.tables, "c3", { upload_id: "up-A", sm2_reps: 5, sm2_interval: 65 }); // mastered

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const body = res.jsonBody as { uploads: Array<{ uploadId: string; masteryDistribution: Record<string, number> }> };
    expect(body.uploads).toHaveLength(1);
    expect(body.uploads[0].uploadId).toBe("up-A");
    expect(body.uploads[0].masteryDistribution).toEqual({
      new: 1, learning: 0, young: 1, mature: 0, mastered: 1,
    });
  });

  it("returns correct attempt counts and accuracy", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });
    seedCard(deps.tables, "c2", { upload_id: "up-A" });

    // 3 attempts on c1: 2 correct, 1 wrong
    seedAttempt(deps.tables, "c1", { correct: true, rowKey: "2026-04-22T09:01:00.000Z_a1" });
    seedAttempt(deps.tables, "c1", { correct: true, rowKey: "2026-04-22T09:02:00.000Z_a2" });
    seedAttempt(deps.tables, "c1", { correct: false, rowKey: "2026-04-22T09:03:00.000Z_a3" });
    // 1 attempt on c2: correct
    seedAttempt(deps.tables, "c2", { correct: true, rowKey: "2026-04-22T09:04:00.000Z_a4" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ totalAttempts: number; correctAttempts: number; accuracyPct: number }> }).uploads[0];
    expect(upload.totalAttempts).toBe(4);
    expect(upload.correctAttempts).toBe(3);
    expect(upload.accuracyPct).toBe(75);
  });

  it("returns lastStudiedAt as most recent attempt timestamp", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });

    seedAttempt(deps.tables, "c1", { timestamp: "2026-04-20T09:00:00.000Z", rowKey: "2026-04-20T09:00:00.000Z_a1" });
    seedAttempt(deps.tables, "c1", { timestamp: "2026-04-22T14:30:00.000Z", rowKey: "2026-04-22T14:30:00.000Z_a2" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ lastStudiedAt: string | null }> }).uploads[0];
    expect(upload.lastStudiedAt).toBe("2026-04-22T14:30:00.000Z");
  });

  it("returns lastStudiedAt null when upload has no attempts in range", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });
    // No attempts seeded

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ lastStudiedAt: string | null; totalAttempts: number }> }).uploads[0];
    expect(upload.lastStudiedAt).toBeNull();
    expect(upload.totalAttempts).toBe(0);
  });

  it("returns avgEase as average sm2_ease across cards", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A", sm2_ease: 2.0 });
    seedCard(deps.tables, "c2", { upload_id: "up-A", sm2_ease: 3.0 });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ avgEase: number }> }).uploads[0];
    expect(upload.avgEase).toBe(2.5);
  });

  it("respects range parameter — excludes attempts outside range", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });

    // Old attempt (outside 7d from NOW=2026-04-23)
    seedAttempt(deps.tables, "c1", { timestamp: "2026-04-10T09:00:00.000Z", rowKey: "2026-04-10T09:00:00.000Z_a1" });
    // Recent attempt (inside 7d)
    seedAttempt(deps.tables, "c1", { timestamp: "2026-04-22T09:00:00.000Z", rowKey: "2026-04-22T09:00:00.000Z_a2" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID, "7d"), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ totalAttempts: number }> }).uploads[0];
    expect(upload.totalAttempts).toBe(1);
  });

  it("handles multiple uploads independently", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A", upload_name: "Chapter 3" });
    seedCard(deps.tables, "c2", { upload_id: "up-B", upload_name: "Chapter 4" });

    seedAttempt(deps.tables, "c1", { correct: true, rowKey: "2026-04-22T09:01:00.000Z_a1" });
    seedAttempt(deps.tables, "c2", { correct: false, rowKey: "2026-04-22T09:02:00.000Z_a2" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const uploads = (res.jsonBody as { uploads: Array<{ uploadId: string; uploadName: string | null; totalAttempts: number; correctAttempts: number; accuracyPct: number }> }).uploads;

    expect(uploads).toHaveLength(2);
    const upA = uploads.find((u) => u.uploadId === "up-A")!;
    const upB = uploads.find((u) => u.uploadId === "up-B")!;
    expect(upA.uploadName).toBe("Chapter 3");
    expect(upA.totalAttempts).toBe(1);
    expect(upA.accuracyPct).toBe(100);
    expect(upB.uploadName).toBe("Chapter 4");
    expect(upB.totalAttempts).toBe(1);
    expect(upB.accuracyPct).toBe(0);
  });

  it("returns uploads sorted by lastStudiedAt desc, nulls last", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });
    seedCard(deps.tables, "c2", { upload_id: "up-B" });
    seedCard(deps.tables, "c3", { upload_id: "up-C" }); // never studied

    seedAttempt(deps.tables, "c1", { timestamp: "2026-04-20T09:00:00.000Z", rowKey: "2026-04-20T09:00:00.000Z_a1" });
    seedAttempt(deps.tables, "c2", { timestamp: "2026-04-22T09:00:00.000Z", rowKey: "2026-04-22T09:00:00.000Z_a2" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const uploads = (res.jsonBody as { uploads: Array<{ uploadId: string; lastStudiedAt: string | null }> }).uploads;

    expect(uploads[0].uploadId).toBe("up-B"); // most recent
    expect(uploads[1].uploadId).toBe("up-A");
    expect(uploads[2].uploadId).toBe("up-C"); // null last
    expect(uploads[2].lastStudiedAt).toBeNull();
  });

  it("finds course owned by another user (family visibility)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    // Course owned by a different user
    const otherUserId = "u-mats";
    deps.tables.upsert("users", {
      partitionKey: PARTITIONS.users, rowKey: otherUserId, name: "Mats",
      password_hash: "hash", is_admin: false, color: "#000", avatar_emoji: "🐻",
      ui_language: "en", settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
      created_at: "2026-01-01T00:00:00.000Z",
    } satisfies UserRow);
    seedCourse(deps.tables, otherUserId);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    expect(res.status).toBe(200);
    expect((res.jsonBody as { uploads: unknown[] }).uploads).toHaveLength(1);
  });

  it("sorts two never-studied uploads stably", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A" });
    seedCard(deps.tables, "c2", { upload_id: "up-B" });
    // No attempts for either upload

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const uploads = (res.jsonBody as { uploads: Array<{ uploadId: string; lastStudiedAt: string | null }> }).uploads;
    expect(uploads).toHaveLength(2);
    expect(uploads[0].lastStudiedAt).toBeNull();
    expect(uploads[1].lastStudiedAt).toBeNull();
  });

  it("ignores attempts for manual cards (no upload_id)", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c-manual", { upload_id: null, source: "manual" });
    seedCard(deps.tables, "c-uploaded", { upload_id: "up-A" });
    // Attempt on the manual card should not appear in upload stats
    seedAttempt(deps.tables, "c-manual", { rowKey: "2026-04-22T09:01:00.000Z_a1" });
    seedAttempt(deps.tables, "c-uploaded", { rowKey: "2026-04-22T09:02:00.000Z_a2" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const uploads = (res.jsonBody as { uploads: Array<{ totalAttempts: number }> }).uploads;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].totalAttempts).toBe(1); // Only the uploaded card's attempt
  });

  it("uses upload_name from any card in the group", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    // First card has no name, second does
    seedCard(deps.tables, "c1", { upload_id: "up-A", upload_name: null });
    seedCard(deps.tables, "c2", { upload_id: "up-A", upload_name: "Chapter 5" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ uploadName: string | null }> }).uploads[0];
    expect(upload.uploadName).toBe("Chapter 5");
  });

  it("includes cardCount and createdAt per upload", async () => {
    const deps = makeDeps();
    seedUser(deps.tables);
    seedCourse(deps.tables);
    seedCard(deps.tables, "c1", { upload_id: "up-A", created_at: "2026-04-20T10:00:00.000Z" });
    seedCard(deps.tables, "c2", { upload_id: "up-A", created_at: "2026-04-20T10:05:00.000Z" });

    const handler = makeStatsUploadHandler(deps);
    const res = await handler(makeReq(validCookie(deps), COURSE_ID), ctx);
    const upload = (res.jsonBody as { uploads: Array<{ cardCount: number; createdAt: string }> }).uploads[0];
    expect(upload.cardCount).toBe(2);
    expect(upload.createdAt).toBe("2026-04-20T10:00:00.000Z");
  });
});
