import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeCoursesHandler, type CoursesDeps } from "./courses.js";
import type { CourseRow } from "./courses-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

function makeReq(
  cookie: string | null,
  opts: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): HttpRequest {
  const { method = "GET", body, query = {} } = opts;
  const url = new URL("http://local/api/courses");
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

function makeDeps(uuids: readonly string[] = []): CoursesDeps & {
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

describe("GET /api/courses", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
  });

  function validCookie(userId = "u-alice", isAdmin = false): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 401 without session cookie", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(null),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("without userId returns the caller's courses", async () => {
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c1", { name: "Alice's Math" }),
    );
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-bob", "c2", { name: "Bob's Latin" }),
    );
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice")),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string }>;
    expect(body.map((c) => c.name)).toEqual(["Alice's Math"]);
  });

  it("with userId returns the requested user's courses", async () => {
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-bob", "c2", { name: "Bob's Latin" }),
    );
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice"), { query: { userId: "u-bob" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string; user_id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.user_id).toBe("u-bob");
  });

  it("returns courses sorted by name ascending", async () => {
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c3", { name: "Zebra" }),
    );
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c1", { name: "Apple" }),
    );
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c2", { name: "Banana" }),
    );
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice")),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string }>;
    expect(body.map((c) => c.name)).toEqual(["Apple", "Banana", "Zebra"]);
  });

  it("returns 200 with empty array when target user has none", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice"), { query: { userId: "u-ghost" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual([]);
  });

  it("stable-sorts courses with equal names (covers sort tie branch)", async () => {
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c1", { name: "Same" }),
    );
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c2", { name: "Same" }),
    );
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice")),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string }>;
    expect(body).toHaveLength(2);
    expect(body.every((c) => c.name === "Same")).toBe(true);
  });

  it("treats req.method=null as GET", async () => {
    const req = {
      ...makeReq(validCookie("u-alice")),
      method: null,
    } as unknown as HttpRequest;
    const res = (await makeCoursesHandler(deps)(req, ctx)) as HttpResponseInit;
    expect(res.status).toBe(200);
  });

  it("treats req.query without a get() as no userId filter", async () => {
    const req = {
      ...makeReq(validCookie("u-alice")),
      query: { notAFunction: true },
    } as unknown as HttpRequest;
    await deps.tables.upsert<CourseRow>(
      "courses",
      course("u-alice", "c1"),
    );
    const res = (await makeCoursesHandler(deps)(req, ctx)) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<unknown>;
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/courses", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps(["c-new-1"]);
  });

  function validCookie(userId = "u-alice", isAdmin = false): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  const validBody = () => ({
    name: "French",
    emoji: "🇫🇷",
    color: "#ff0000",
    language: "fr-FR",
    default_mode: "ask",
    year_id: "y-current",
  });

  it("returns 401 without session", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(null, { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), default_mode: "bad" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing body", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie(), { method: "POST" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("creates course for session userId even when body specifies a different user_id", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice"), {
        method: "POST",
        body: { ...validBody(), user_id: "u-hacker" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe("c-new-1");
    expect(body.user_id).toBe("u-alice");
    const stored = await deps.tables.getById<CourseRow>(
      "courses",
      "u-alice",
      "c-new-1",
    );
    expect(stored?.user_id).toBe("u-alice");
    expect(stored?.partitionKey).toBe("u-alice");
  });

  it("persists id from random.uuid() and created_at from clock.now()", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice"), { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const stored = await deps.tables.getById<CourseRow>(
      "courses",
      "u-alice",
      "c-new-1",
    );
    expect(stored?.created_at).toBe("2026-04-22T09:00:00.000Z");
    expect(stored?.year_id).toBe("y-current");
    expect(stored?.language).toBe("fr-FR");
  });

  it("accepts language: null and stores null", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie("u-alice"), {
        method: "POST",
        body: { ...validBody(), language: null },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const stored = await deps.tables.getById<CourseRow>(
      "courses",
      "u-alice",
      "c-new-1",
    );
    expect(stored?.language).toBeNull();
  });

  it("returns 405 for unsupported method", async () => {
    const res = (await makeCoursesHandler(deps)(
      makeReq(validCookie(), { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });
});
