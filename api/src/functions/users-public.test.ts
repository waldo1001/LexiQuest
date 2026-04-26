import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeUsersPublicHandler } from "./users-public.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import type { UserRow } from "../shared/seed.js";

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
    color: "#123",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 20 },
    created_at: "2026-04-22T00:00:00Z",
    ...overrides,
  };
}

const req = {} as HttpRequest;
const ctx = {} as InvocationContext;

describe("GET /api/users/public", () => {
  let tables: FakeTableStorage;

  beforeEach(() => {
    tables = new FakeTableStorage();
  });

  it("returns 200 with [] on empty store", async () => {
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual([]);
  });

  it("projects only { id, name, avatar_emoji, color }", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await tables.upsert<UserRow>("users", userRow("u2", "Bob"));
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const body = res.jsonBody as unknown[];
    for (const item of body) {
      expect(Object.keys(item as object).sort()).toEqual([
        "avatar_emoji",
        "color",
        "id",
        "name",
      ]);
    }
  });

  it("response NEVER contains sensitive fields", async () => {
    await tables.upsert<UserRow>(
      "users",
      userRow("u1", "Alice", { is_admin: true }),
    );
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const serialized = JSON.stringify(res.jsonBody);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("fake$");
    expect(serialized).not.toContain("is_admin");
    expect(serialized).not.toContain("settings");
    expect(serialized).not.toContain("ui_language");
  });

  it("is stable when two users share a name", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Alice"));
    await tables.upsert<UserRow>("users", userRow("u2", "Alice"));
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const names = (res.jsonBody as { name: string }[]).map((u) => u.name);
    expect(names).toEqual(["Alice", "Alice"]);
  });

  it("sorts results by name", async () => {
    await tables.upsert<UserRow>("users", userRow("u1", "Zoe"));
    await tables.upsert<UserRow>("users", userRow("u2", "Alice"));
    await tables.upsert<UserRow>("users", userRow("u3", "Mats"));
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const names = (res.jsonBody as { name: string }[]).map((u) => u.name);
    expect(names).toEqual(["Alice", "Mats", "Zoe"]);
  });

  it("excludes admin users from the picker", async () => {
    await tables.upsert<UserRow>(
      "users",
      userRow("u-admin", "Waldo", { is_admin: true }),
    );
    await tables.upsert<UserRow>("users", userRow("u-kid1", "Kaat"));
    await tables.upsert<UserRow>("users", userRow("u-kid2", "Amaryllis"));
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const names = (res.jsonBody as { name: string }[]).map((u) => u.name);
    expect(names).toEqual(["Amaryllis", "Kaat"]);
  });

  it("alphabetical sort still holds when admins are interleaved", async () => {
    await tables.upsert<UserRow>(
      "users",
      userRow("u1", "Waldo", { is_admin: true }),
    );
    await tables.upsert<UserRow>("users", userRow("u2", "Zoe"));
    await tables.upsert<UserRow>("users", userRow("u3", "Alice"));
    await tables.upsert<UserRow>(
      "users",
      userRow("u4", "Adminssen", { is_admin: true }),
    );
    await tables.upsert<UserRow>("users", userRow("u5", "Mats"));
    const res = (await makeUsersPublicHandler({ tables })(
      req,
      ctx,
    )) as HttpResponseInit;
    const names = (res.jsonBody as { name: string }[]).map((u) => u.name);
    expect(names).toEqual(["Alice", "Mats", "Zoe"]);
  });
});
