import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeUsersHandler, type UsersDeps } from "./users.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakePasswordHasher } from "../../testing/fake-password-hasher.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

function makeReq(
  cookie: string | null,
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "GET", body } = opts;
  return {
    method,
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

function userRow(
  id: string,
  name: string,
  overrides: Partial<UserRow> = {},
): UserRow {
  return {
    partitionKey: "users",
    rowKey: id,
    name,
    password_hash: "fake$s0001$should-never-leak",
    is_admin: false,
    color: "#123456",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: {
      auto_speak: false,
      preferred_mode: "self_grade",
      daily_goal: 20,
    },
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(uuids: readonly string[] = []): UsersDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  hasher: FakePasswordHasher;
  random: FakeRandom;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  const hasher = new FakePasswordHasher();
  const random = new FakeRandom(uuids);
  return { tables, signer, clock, hasher, random };
}

describe("GET /api/users", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  function validCookie(userId = "u-admin", isAdmin = true): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 401 when no session cookie is present", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(null),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 401 when session token is invalid", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq("session=tampered-garbage"),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty array when no users exist", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual([]);
  });

  it("returns 200 with all users sorted by name", async () => {
    await deps.tables.upsert<UserRow>("users", userRow("u3", "Charlie"));
    await deps.tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await deps.tables.upsert<UserRow>("users", userRow("u2", "Bob"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string }>;
    expect(body.map((u) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("response items never contain password_hash", async () => {
    await deps.tables.upsert<UserRow>("users", userRow("u1", "Alice"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    const serialized = JSON.stringify(res.jsonBody);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("fake$");
    expect(serialized).not.toContain("should-never-leak");
  });

  it("response items contain the expected full profile shape", async () => {
    await deps.tables.upsert<UserRow>(
      "users",
      userRow("u1", "Alice", { is_admin: true, ui_language: "en" }),
    );

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    const [item] = res.jsonBody as Array<Record<string, unknown>>;
    expect(item.id).toBe("u1");
    expect(item.name).toBe("Alice");
    expect(item.isAdmin).toBe(true);
    expect(item.color).toBe("#123456");
    expect(item.avatar_emoji).toBe("🦊");
    expect(item.ui_language).toBe("en");
    expect(item.settings).toEqual({
      auto_speak: false,
      preferred_mode: "self_grade",
      daily_goal: 20,
    });
    expect(item.created_at).toBe("2026-04-22T00:00:00.000Z");
    expect(Object.keys(item).sort()).toEqual([
      "avatar_emoji",
      "avatar_image_url",
      "color",
      "created_at",
      "id",
      "isAdmin",
      "name",
      "settings",
      "ui_language",
    ]);
  });

  it("returns 405 for unsupported method PATCH", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("non-admin authenticated user receives the full user list", async () => {
    await deps.tables.upsert<UserRow>("users", userRow("u1", "Alice"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie("u-regular", false)),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as unknown[];
    expect(body).toHaveLength(1);
  });

  it("treats null req.method as GET", async () => {
    const nullMethodReq = {
      method: null,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "cookie" ? validCookie() : null;
        },
      },
    } as unknown as HttpRequest;

    const res = (await makeUsersHandler(deps)(
      nullMethodReq,
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
  });

  it("returns stable order when two users share the same name", async () => {
    await deps.tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await deps.tables.upsert<UserRow>("users", userRow("u2", "Alice"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    expect((res.jsonBody as unknown[]).length).toBe(2);
  });
});

describe("POST /api/users", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps(["u-new-1"]);
  });

  function validCookie(userId = "u-admin", isAdmin = true): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  const validBody = () => ({
    name: "Zoe",
    password: "secret1",
    is_admin: false,
    color: "#ff00aa",
    avatar_emoji: "🦄",
    ui_language: "en" as const,
  });

  it("POST returns 401 without a session cookie", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(null, { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("POST returns 403 when caller is non-admin", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie("u-regular", false), {
        method: "POST",
        body: validBody(),
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when name or password is missing", async () => {
    const res1 = (await makeUsersHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), name: "" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res1.status).toBe(400);

    const depsB = makeDeps(["u-new-2"]);
    const tokenB = depsB.signer.sign({
      userId: "u-admin",
      isAdmin: true,
      expMs: depsB.clock.nowMs() + 60_000,
    });
    const res2 = (await makeUsersHandler(depsB)(
      makeReq(buildSessionCookie(tokenB), {
        method: "POST",
        body: { ...validBody(), password: "" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res2.status).toBe(400);
  });

  it("POST returns 400 when ui_language is invalid", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), ui_language: "fr" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("POST returns 409 on duplicate name", async () => {
    await deps.tables.upsert<UserRow>(
      "users",
      userRow("u-existing", "Zoe"),
    );
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(409);
  });

  it("POST returns 201 with the created profile and never leaks password_hash", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe("u-new-1");
    expect(body.name).toBe("Zoe");
    expect(body.isAdmin).toBe(false);
    expect(body.ui_language).toBe("en");
    expect(body).not.toHaveProperty("password_hash");
    expect(JSON.stringify(body)).not.toContain("fake$");
    expect(JSON.stringify(body)).not.toContain("secret1");
  });

  it("POST persists the new user with a hashed password", async () => {
    await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "POST", body: validBody() }),
      ctx,
    );
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-new-1",
    );
    expect(stored).not.toBeNull();
    expect(stored?.name).toBe("Zoe");
    expect(stored?.password_hash).toMatch(/^fake\$/);
    expect(stored?.password_hash).toContain("secret1");
    expect(stored?.created_at).toBe("2026-04-22T09:00:00.000Z");
    expect(stored?.settings).toEqual({
      auto_speak: true,
      preferred_mode: "ask",
      daily_goal: 20,
    });
  });

  it("POST rejects a non-object body with 400", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "POST", body: "not-an-object" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("POST rejects a missing body with 400", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), { method: "POST" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("POST accepts an optional settings override", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: {
          ...validBody(),
          settings: { daily_goal: 42, preferred_mode: "mcq" },
        },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-new-1",
    );
    expect(stored?.settings).toEqual({
      auto_speak: true,
      preferred_mode: "mcq",
      daily_goal: 42,
    });
  });

  it("POST rejects an invalid settings value with 400", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), settings: { daily_goal: -1 } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });
});
