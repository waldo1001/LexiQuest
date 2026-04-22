import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeCoursesIdHandler, type CoursesIdDeps } from "./courses-id.js";
import type { CourseRow } from "./courses-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import type { Entity } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";

function userRow(id: string): UserRow {
  return {
    partitionKey: "users",
    rowKey: id,
    name: id,
    password_hash: "fake$unused",
    is_admin: false,
    color: "#000",
    avatar_emoji: "🙂",
    ui_language: "nl",
    settings: { auto_speak: false, preferred_mode: "ask", daily_goal: 20 },
    created_at: "2026-04-22T00:00:00.000Z",
  };
}

async function seedUsers(
  tables: FakeTableStorage,
  ...ids: readonly string[]
): Promise<void> {
  for (const id of ids) {
    await tables.upsert<UserRow>("users", userRow(id));
  }
}

function makeReq(
  cookie: string | null,
  params: Record<string, string> = {},
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "PUT", body } = opts;
  return {
    method,
    params,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
    json: async () =>
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function course(
  userId: string,
  id: string,
  overrides: Partial<CourseRow> = {},
): CourseRow {
  return {
    partitionKey: userId,
    rowKey: id,
    user_id: userId,
    year_id: "y1",
    name: `course-${id}`,
    emoji: "📘",
    color: "#123456",
    language: null,
    default_mode: "ask",
    created_at: "2026-04-22T09:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(): CoursesIdDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  return { tables, signer, clock };
}

describe("PUT /api/courses/:id", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  function cookie(userId = "u-alice", isAdmin = false): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 401 without session", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(null, { id: "c1" }, { body: { name: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 when id path param is missing", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie(), {}, { body: { name: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when course id unknown (own partition and admin sweep)", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "missing" }, { body: { name: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-admin tries to update someone else's course", async () => {
    await seedUsers(deps.tables, "u-alice", "u-bob");
    await deps.tables.upsert<CourseRow>("courses", course("u-bob", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "c1" }, { body: { name: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("returns 200 when owner updates their own course", async () => {
    await deps.tables.upsert<CourseRow>("courses", course("u-alice", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(
        cookie("u-alice"),
        { id: "c1" },
        { body: { name: "Renamed", color: "#00ff00" } },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.name).toBe("Renamed");
    expect(body.color).toBe("#00ff00");
  });

  it("returns 200 when admin updates anyone's course", async () => {
    await seedUsers(deps.tables, "u-admin", "u-bob");
    await deps.tables.upsert<CourseRow>("courses", course("u-bob", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(
        cookie("u-admin", true),
        { id: "c1" },
        { body: { name: "AdminEdited" } },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await deps.tables.getById<CourseRow>(
      "courses",
      "u-bob",
      "c1",
    );
    expect(stored?.name).toBe("AdminEdited");
    expect(stored?.user_id).toBe("u-bob");
  });

  it("ignores body attempts to mutate user_id or year_id", async () => {
    await deps.tables.upsert<CourseRow>("courses", course("u-alice", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(
        cookie("u-alice"),
        { id: "c1" },
        {
          body: {
            name: "Renamed",
            user_id: "u-hacker",
            year_id: "y-hacker",
          },
        },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await deps.tables.getById<CourseRow>(
      "courses",
      "u-alice",
      "c1",
    );
    expect(stored?.user_id).toBe("u-alice");
    expect(stored?.year_id).toBe("y1");
  });

  it("returns 400 on invalid body", async () => {
    await deps.tables.upsert<CourseRow>("courses", course("u-alice", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(
        cookie("u-alice"),
        { id: "c1" },
        { body: { default_mode: "bogus" } },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing body", async () => {
    await deps.tables.upsert<CourseRow>("courses", course("u-alice", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "c1" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 405 for unsupported method", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie(), { id: "c1" }, { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });
});

describe("DELETE /api/courses/:id", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  function cookie(userId = "u-alice", isAdmin = false): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 401 without session", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(null, { id: "c1" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 404 when course id unknown", async () => {
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "missing" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-admin tries to delete someone else's course", async () => {
    await seedUsers(deps.tables, "u-alice", "u-bob");
    await deps.tables.upsert<CourseRow>("courses", course("u-bob", "c1"));
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "c1" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("returns 204 when owner deletes; cascades cards in the course partition", async () => {
    await deps.tables.upsert<CourseRow>("courses", course("u-alice", "c1"));
    await deps.tables.upsert<Entity>("cards", {
      partitionKey: "c1",
      rowKey: "k1",
    });
    await deps.tables.upsert<Entity>("cards", {
      partitionKey: "c1",
      rowKey: "k2",
    });
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-alice"), { id: "c1" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(204);
    expect(
      await deps.tables.getById<CourseRow>("courses", "u-alice", "c1"),
    ).toBeNull();
    expect(await deps.tables.listByPartition<Entity>("cards", "c1")).toEqual(
      [],
    );
  });

  it("returns 204 when admin deletes anyone's course and cascades", async () => {
    await seedUsers(deps.tables, "u-admin", "u-bob");
    await deps.tables.upsert<CourseRow>("courses", course("u-bob", "c1"));
    await deps.tables.upsert<Entity>("cards", {
      partitionKey: "c1",
      rowKey: "k1",
    });
    const res = (await makeCoursesIdHandler(deps)(
      makeReq(cookie("u-admin", true), { id: "c1" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(204);
    expect(
      await deps.tables.getById<CourseRow>("courses", "u-bob", "c1"),
    ).toBeNull();
    expect(await deps.tables.listByPartition<Entity>("cards", "c1")).toEqual(
      [],
    );
  });
});
