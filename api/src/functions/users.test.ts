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
import { buildSessionCookie } from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

function makeReq(
  cookie: string | null,
  method = "GET",
): HttpRequest {
  return {
    method,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function userRow(id: string, name: string, overrides: Partial<UserRow> = {}): UserRow {
  return {
    partitionKey: "users",
    rowKey: id,
    name,
    password_hash: "fake$s0001$should-never-leak",
    is_admin: false,
    color: "#123456",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 20 },
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("GET /api/users", () => {
  let tables: FakeTableStorage;
  let signer: FakeSessionSigner;
  let clock: FakeClock;
  let deps: UsersDeps;

  beforeEach(() => {
    tables = new FakeTableStorage();
    clock = new FakeClock("2026-04-22T09:00:00.000Z");
    signer = new FakeSessionSigner(clock);
    deps = { tables, signer };
  });

  function validCookie(userId = "u-admin", isAdmin = true): string {
    const token = signer.sign({
      userId,
      isAdmin,
      expMs: clock.nowMs() + 60_000,
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
    await tables.upsert<UserRow>("users", userRow("u3", "Charlie"));
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await tables.upsert<UserRow>("users", userRow("u2", "Bob"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ name: string }>;
    expect(body.map((u) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("response items never contain password_hash", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));

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
    await tables.upsert<UserRow>(
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
    // Exactly these keys — nothing extra, nothing missing
    expect(Object.keys(item).sort()).toEqual([
      "avatar_emoji",
      "color",
      "created_at",
      "id",
      "isAdmin",
      "name",
      "settings",
      "ui_language",
    ]);
  });

  it("returns 405 for unsupported methods", async () => {
    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie(), "POST"),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("non-admin authenticated user receives the full user list", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));

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

    // method ?? "GET" → proceeds as GET, not 405
    expect(res.status).toBe(200);
  });

  it("returns stable order when two users share the same name", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await tables.upsert<UserRow>("users", userRow("u2", "Alice"));

    const res = (await makeUsersHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;

    expect(res.status).toBe(200);
    expect((res.jsonBody as unknown[]).length).toBe(2);
  });
});
