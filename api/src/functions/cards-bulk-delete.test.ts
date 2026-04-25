import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import {
  makeCardsBulkDeleteHandler,
  type CardsBulkDeleteDeps,
} from "./cards-bulk-delete.js";
import type { CardRow } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import type { UserRow } from "../shared/seed.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import { PARTITIONS } from "../shared/table-partitions.js";

const ctx = {} as InvocationContext;
const NOW = "2026-04-25T10:00:00.000Z";
const OWNER_ID = "u-lex";
const OTHER_ID = "u-mats";
const ADMIN_ID = "u-waldo";
const COURSE_ID = "course-fr";
const OTHER_COURSE_ID = "course-en";

function makeReq(
  cookie: string | null,
  body: unknown,
  method = "POST",
): HttpRequest {
  return {
    method,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
    query: { get: () => null },
    params: {},
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

function makeUser(userId: string, isAdmin = false): UserRow {
  return {
    partitionKey: PARTITIONS.users,
    rowKey: userId,
    name: isAdmin ? "Waldo" : userId,
    password_hash: "hash:password",
    color: "#2563eb",
    avatar_emoji: "🦊",
    ui_language: "en",
    is_admin: isAdmin,
    settings: "{}",
    created_at: NOW,
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
    created_at: NOW,
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
    question: "Q",
    answer: "A",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: NOW,
    created_at: NOW,
    upload_id: null,
    ...overrides,
  };
}

function makeDeps(): CardsBulkDeleteDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock(NOW);
  const signer = new FakeSessionSigner(clock);
  return { tables, signer, clock };
}

function cookieFor(
  deps: { signer: FakeSessionSigner; clock: FakeClock },
  userId: string,
  isAdmin = false,
): string {
  const token = deps.signer.sign({
    userId,
    isAdmin,
    expMs: deps.clock.nowMs() + 60_000,
  });
  return buildSessionCookie(token);
}

describe("POST /api/cards/bulk-delete", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(async () => {
    deps = makeDeps();
    await deps.tables.upsert("users", makeUser(OWNER_ID, false));
    await deps.tables.upsert("users", makeUser(OTHER_ID, false));
    await deps.tables.upsert("users", makeUser(ADMIN_ID, true));
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, COURSE_ID));
  });

  // ---------- method / auth / shape ----------

  it("returns 405 on GET", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: true }, "GET"),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 405 on DELETE (only POST allowed)", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: true }, "DELETE"),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(null, { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 when courseId missing", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when no selector is provided", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than one selector is provided", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), {
        courseId: COURSE_ID,
        all: true,
        uploadId: "upload-1",
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids is empty array", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, ids: [] }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when all is not true", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: "yes" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids contains non-string", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, ids: ["a", 42] }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  // ---------- auth boundary ----------

  it("returns 404 when courseId does not exist", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: "course-missing", all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is neither owner nor admin", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OTHER_ID), { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
    const remaining = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(remaining.length).toBe(1); // nothing deleted
  });

  it("admin can bulk-delete in a course they don't own", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c2"));
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, ADMIN_ID, true), { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const remaining = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(remaining.length).toBe(0);
  });

  // ---------- selector: uploadId ----------

  it("by uploadId: deletes only cards whose upload_id matches", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1", { upload_id: "upl-A" }));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c2", { upload_id: "upl-A" }));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c3", { upload_id: "upl-B" }));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c4", { upload_id: null }));

    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, uploadId: "upl-A" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(2);

    const remaining = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const ids = remaining.map((c) => c.rowKey).sort();
    expect(ids).toEqual(["c3", "c4"]);
  });

  it("by uploadId: unknown upload returns 200 with deleted=0 (idempotent)", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1", { upload_id: "upl-A" }));
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, uploadId: "upl-NOPE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(0);
  });

  it("by uploadId: does not touch cards in other courses with same upload_id", async () => {
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, OTHER_COURSE_ID));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1", { upload_id: "upl-X" }));
    await deps.tables.upsert("cards", makeCard(OTHER_COURSE_ID, "c-other", { upload_id: "upl-X" }));

    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, uploadId: "upl-X" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);

    const otherRemaining = await deps.tables.listByPartition<CardRow>("cards", OTHER_COURSE_ID);
    expect(otherRemaining.length).toBe(1);
  });

  // ---------- selector: ids ----------

  it("by ids: deletes only listed ids in the course", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c2"));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c3"));

    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, ids: ["c1", "c3"] }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(2);

    const remaining = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(remaining.map((c) => c.rowKey)).toEqual(["c2"]);
  });

  it("by ids: ignores ids that don't exist in this course", async () => {
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, OTHER_COURSE_ID));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    await deps.tables.upsert("cards", makeCard(OTHER_COURSE_ID, "c-other"));

    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, ids: ["c1", "c-other", "c-ghost"] }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(1);

    // The other course's card must be untouched
    const otherRemaining = await deps.tables.listByPartition<CardRow>("cards", OTHER_COURSE_ID);
    expect(otherRemaining.length).toBe(1);
  });

  // ---------- selector: all ----------

  it("by all: deletes every card in the course", async () => {
    await deps.tables.upsert("courses", makeCourse(OWNER_ID, OTHER_COURSE_ID));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c2"));
    await deps.tables.upsert("cards", makeCard(OTHER_COURSE_ID, "c-other"));

    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(2);

    const here = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    const other = await deps.tables.listByPartition<CardRow>("cards", OTHER_COURSE_ID);
    expect(here.length).toBe(0);
    expect(other.length).toBe(1);
  });

  it("by all: empty course returns 200 with deleted=0", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as { deleted: number }).deleted).toBe(0);
  });

  // ---------- auth boundary meta ----------

  it("ignores body.userId — userId is read from session only", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    // u-mats sets body.userId=u-lex trying to impersonate the owner
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OTHER_ID), {
        courseId: COURSE_ID,
        all: true,
        userId: OWNER_ID,
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
    const remaining = await deps.tables.listByPartition<CardRow>("cards", COURSE_ID);
    expect(remaining.length).toBe(1);
  });

  it("response shape is { deleted: number }", async () => {
    await deps.tables.upsert("cards", makeCard(COURSE_ID, "c1"));
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), { courseId: COURSE_ID, all: true }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(typeof body.deleted).toBe("number");
    expect(Object.keys(body)).toEqual(["deleted"]);
  });

  it("rejects non-object body", async () => {
    const res = (await makeCardsBulkDeleteHandler(deps)(
      makeReq(cookieFor(deps, OWNER_ID), null),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });
});
