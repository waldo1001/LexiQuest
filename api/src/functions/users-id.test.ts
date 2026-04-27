import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeUsersIdHandler, type UsersIdDeps } from "./users-id.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakePasswordHasher } from "../../testing/fake-password-hasher.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

function makeReq(
  cookie: string | null,
  opts: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
): HttpRequest {
  const { method = "PUT", body, params = { id: "u-target" } } = opts;
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

function userRow(
  id: string,
  name: string,
  overrides: Partial<UserRow> = {},
): UserRow {
  return {
    partitionKey: "users",
    rowKey: id,
    name,
    password_hash: "fake$s0001$original-pw",
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

function makeDeps(): UsersIdDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  hasher: FakePasswordHasher;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  const hasher = new FakePasswordHasher();
  return { tables, signer, clock, hasher };
}

describe("PUT /api/users/:id", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(async () => {
    deps = makeDeps();
    await deps.tables.upsert<UserRow>(
      "users",
      userRow("u-target", "Target"),
    );
  });

  function adminCookie(userId = "u-admin"): string {
    const token = deps.signer.sign({
      userId,
      isAdmin: true,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  function nonAdminCookie(): string {
    const token = deps.signer.sign({
      userId: "u-regular",
      isAdmin: false,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("PUT returns 401 without a session cookie", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(null, { body: { name: "New" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("PUT returns 403 when caller is non-admin", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(nonAdminCookie(), { body: { name: "New" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("PUT returns 404 when target user does not exist", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        body: { name: "New" },
        params: { id: "u-ghost" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("PUT returns 400 on invalid ui_language", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { ui_language: "fr" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 on invalid is_admin type", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { is_admin: "yes" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("PUT returns 400 on empty password string", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { password: "" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("PUT merges supplied fields and keeps others unchanged", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        body: {
          name: "Renamed",
          color: "#aabbcc",
          ui_language: "en",
          is_admin: true,
          settings: { daily_goal: 50 },
        },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored?.name).toBe("Renamed");
    expect(stored?.color).toBe("#aabbcc");
    expect(stored?.ui_language).toBe("en");
    expect(stored?.is_admin).toBe(true);
    expect(stored?.avatar_emoji).toBe("🦊");
    expect(stored?.settings).toEqual({
      auto_speak: false,
      preferred_mode: "self_grade",
      daily_goal: 50,
    });
  });

  it("PUT rehashes password when provided, never returns the hash", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { password: "brand-new-pw" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body).not.toHaveProperty("password_hash");
    expect(JSON.stringify(body)).not.toContain("fake$");
    expect(JSON.stringify(body)).not.toContain("brand-new-pw");
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored?.password_hash).not.toBe("fake$s0001$original-pw");
    expect(stored?.password_hash).toContain("brand-new-pw");
  });

  it("PUT without password preserves the existing password_hash", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { name: "Just a rename" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored?.password_hash).toBe("fake$s0001$original-pw");
  });

  it("PUT ignores body attempts to mutate rowKey / created_at / partitionKey / password_hash directly", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        body: {
          rowKey: "u-imposter",
          partitionKey: "hijack",
          created_at: "1999-01-01T00:00:00Z",
          password_hash: "tampered$hash",
          name: "ok to change",
        },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const original = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(original?.rowKey).toBe("u-target");
    expect(original?.partitionKey).toBe("users");
    expect(original?.created_at).toBe("2026-04-22T00:00:00.000Z");
    expect(original?.password_hash).toBe("fake$s0001$original-pw");
    expect(original?.name).toBe("ok to change");
    const imposter = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-imposter",
    );
    expect(imposter).toBeNull();
  });

  it("PUT returns 400 on non-object body", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: "nope" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("AVATAR-11: PUT updates avatar_image_url and persists on round-trip", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        body: { avatar_image_url: "/icons/icon-192.png" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.avatar_image_url).toBe("/icons/icon-192.png");
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored?.avatar_image_url).toBe("/icons/icon-192.png");

    const cleared = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { body: { avatar_image_url: null } }),
      ctx,
    )) as HttpResponseInit;
    expect(cleared.status).toBe(200);
    const after = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(after?.avatar_image_url).toBeUndefined();
  });

  it("PUT treats missing body as empty patch and returns 200 unchanged", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "PUT" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored?.name).toBe("Target");
  });
});

describe("DELETE /api/users/:id", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(async () => {
    deps = makeDeps();
    await deps.tables.upsert<UserRow>(
      "users",
      userRow("u-target", "Target"),
    );
    await deps.tables.upsert<UserRow>(
      "users",
      userRow("u-admin", "Admin", { is_admin: true }),
    );
  });

  function adminCookie(userId = "u-admin"): string {
    const token = deps.signer.sign({
      userId,
      isAdmin: true,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("DELETE returns 401 without a session cookie", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(null, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("DELETE returns 403 when caller is non-admin", async () => {
    const token = deps.signer.sign({
      userId: "u-regular",
      isAdmin: false,
      expMs: deps.clock.nowMs() + 60_000,
    });
    const res = (await makeUsersIdHandler(deps)(
      makeReq(buildSessionCookie(token), { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("DELETE returns 404 when target user does not exist", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        method: "DELETE",
        params: { id: "u-ghost" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("DELETE hard-deletes the user and returns 204", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(204);
    const stored = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored).toBeNull();
  });

  it("DELETE returns 403 when admin targets their own rowKey", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie("u-admin"), {
        method: "DELETE",
        params: { id: "u-admin" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
    const still = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-admin",
    );
    expect(still).not.toBeNull();
  });

  it("DELETE cascades the user's courses, cards, attempts, and sessions", async () => {
    await deps.tables.upsert("courses", {
      partitionKey: "u-target",
      rowKey: "c-french",
      name: "French",
    });
    await deps.tables.upsert("cards", {
      partitionKey: "c-french",
      rowKey: "card-1",
      question: "q",
    });
    await deps.tables.upsert("attempts", {
      partitionKey: "u-target",
      rowKey: "2026-04-22T09:00:00Z_a",
      correct: true,
    });
    await deps.tables.upsert("sessions", {
      partitionKey: "u-target",
      rowKey: "2026-04-22T09:00:00Z_s",
      ended_at: null,
    });

    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(204);
    expect(deps.tables.size("courses", "u-target")).toBe(0);
    expect(deps.tables.size("cards", "c-french")).toBe(0);
    expect(deps.tables.size("attempts", "u-target")).toBe(0);
    expect(deps.tables.size("sessions", "u-target")).toBe(0);
    const ghost = await deps.tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(ghost).toBeNull();
  });

  it("DELETE 404 does not cascade", async () => {
    await deps.tables.upsert("courses", {
      partitionKey: "u-target",
      rowKey: "c-still",
      name: "Still here",
    });

    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), {
        method: "DELETE",
        params: { id: "u-ghost" },
      }),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(404);
    expect(deps.tables.size("courses", "u-target")).toBe(1);
  });
});

describe("method and param guards on users/{id}", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  function adminCookie(): string {
    const token = deps.signer.sign({
      userId: "u-admin",
      isAdmin: true,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 405 for unsupported methods on users/{id}", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "GET" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);

    const res2 = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "POST", body: {} }),
      ctx,
    )) as HttpResponseInit;
    expect(res2.status).toBe(405);
  });

  it("returns 400 when id path param is missing", async () => {
    const res = (await makeUsersIdHandler(deps)(
      makeReq(adminCookie(), { method: "DELETE", params: {} }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });
});
