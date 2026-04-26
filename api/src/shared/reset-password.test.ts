import { describe, it, expect } from "vitest";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakePasswordHasher } from "../../testing/fake-password-hasher.js";
import {
  BulkNoOpError,
  MissingPasswordError,
  UserNotFoundError,
  resetPassword,
  resetPasswordsBulk,
} from "./reset-password.js";
import type { UserRow } from "./seed.js";

function makeUser(overrides: Partial<UserRow>): UserRow {
  return {
    partitionKey: "users",
    rowKey: "u-default",
    name: "User",
    password_hash: "fake$s0001$old-secret",
    is_admin: false,
    color: "#000000",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: {
      auto_speak: true,
      preferred_mode: "ask",
      daily_goal: 20,
      theme: "playful",
    },
    created_at: "2026-04-22T09:00:00.000Z",
    ...overrides,
  };
}

async function seedRoster(
  tables: FakeTableStorage,
  rows: UserRow[],
): Promise<void> {
  for (const row of rows) {
    await tables.upsert<UserRow>("users", row);
  }
}

describe("resetPassword", () => {
  it("updates password_hash for an existing user looked up by name", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({
        rowKey: "u-lex",
        name: "Lex",
        password_hash: "fake$s0001$old",
      }),
    ]);

    await resetPassword({ tables, hasher, name: "Lex", password: "newpw" });

    const stored = await tables.getById<UserRow>("users", "users", "u-lex");
    expect(stored).not.toBeNull();
    expect(stored!.password_hash).not.toBe("fake$s0001$old");
    expect(await hasher.verify("newpw", stored!.password_hash)).toBe(true);
  });

  it("preserves rowKey, is_admin, color, avatar_emoji, ui_language, settings, created_at", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    const original = makeUser({
      rowKey: "u-waldo",
      name: "Waldo",
      is_admin: true,
      color: "#2563eb",
      avatar_emoji: "🦊",
      ui_language: "nl",
      settings: {
        auto_speak: false,
        preferred_mode: "mcq",
        daily_goal: 30,
        theme: "classic",
        streak: 5,
        last_session_date: "2026-04-25",
        freeze_tokens: 2,
        total_xp: 1234,
        badges: ["first-week"],
      },
      created_at: "2026-04-22T09:00:00.000Z",
    });
    await seedRoster(tables, [original]);

    await resetPassword({ tables, hasher, name: "Waldo", password: "wpw2" });

    const stored = await tables.getById<UserRow>("users", "users", "u-waldo");
    expect(stored!.rowKey).toBe(original.rowKey);
    expect(stored!.is_admin).toBe(original.is_admin);
    expect(stored!.color).toBe(original.color);
    expect(stored!.avatar_emoji).toBe(original.avatar_emoji);
    expect(stored!.ui_language).toBe(original.ui_language);
    expect(stored!.settings).toEqual(original.settings);
    expect(stored!.created_at).toBe(original.created_at);
  });

  it("hashes plaintext via the injected hasher (no plaintext stored)", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({ rowKey: "u-lex", name: "Lex" }),
    ]);

    await resetPassword({ tables, hasher, name: "Lex", password: "newpw" });

    const stored = await tables.getById<UserRow>("users", "users", "u-lex");
    expect(stored!.password_hash).not.toBe("newpw");
    expect(stored!.password_hash.startsWith("fake$")).toBe(true);
  });

  it("is idempotent — running twice with the same password leaves the row valid", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({ rowKey: "u-lex", name: "Lex" }),
    ]);

    await resetPassword({ tables, hasher, name: "Lex", password: "newpw" });
    const firstHash = (
      await tables.getById<UserRow>("users", "users", "u-lex")
    )!.password_hash;
    await resetPassword({ tables, hasher, name: "Lex", password: "newpw" });
    const secondHash = (
      await tables.getById<UserRow>("users", "users", "u-lex")
    )!.password_hash;

    // FakePasswordHasher salts each call → hashes differ but both verify.
    expect(secondHash).not.toBe(firstHash);
    expect(await hasher.verify("newpw", secondHash)).toBe(true);
    expect(await hasher.verify("newpw", firstHash)).toBe(true);
  });

  it("throws UserNotFoundError when name does not match any user", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [makeUser({ rowKey: "u-lex", name: "Lex" })]);

    const err = await resetPassword({
      tables,
      hasher,
      name: "Nobody",
      password: "x",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserNotFoundError);
    const e = err as UserNotFoundError;
    // Message must not echo the unknown name (harmless here, but cheap to lock).
    expect(e.message).toMatch(/user not found/i);
    // Plaintext must never appear in error messages.
    expect(e.message).not.toMatch(/x/);
  });

  it("throws MissingPasswordError when password is empty", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [makeUser({ rowKey: "u-lex", name: "Lex" })]);

    const err = await resetPassword({
      tables,
      hasher,
      name: "Lex",
      password: "",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingPasswordError);
  });

  it("returns id and name only — never the password_hash", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [makeUser({ rowKey: "u-lex", name: "Lex" })]);

    const result = await resetPassword({
      tables,
      hasher,
      name: "Lex",
      password: "newpw",
    });

    expect(result).toEqual({ id: "u-lex", name: "Lex", updated: true });
    expect(JSON.stringify(result)).not.toMatch(/password|hash|fake\$/i);
  });

  it("name match is case-sensitive", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [makeUser({ rowKey: "u-lex", name: "Lex" })]);

    const err = await resetPassword({
      tables,
      hasher,
      name: "lex",
      password: "x",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserNotFoundError);
  });
});

describe("resetPasswordsBulk", () => {
  it("updates every user whose env-var lookup returns a non-empty string", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({ rowKey: "u-waldo", name: "Waldo", is_admin: true }),
      makeUser({ rowKey: "u-lex", name: "Lex" }),
    ]);
    const passwords: Record<string, string> = { Waldo: "wpw2", Lex: "lpw2" };

    const results = await resetPasswordsBulk({
      tables,
      hasher,
      getPassword: (n) => passwords[n],
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.updated)).toBe(true);
    const waldo = await tables.getById<UserRow>("users", "users", "u-waldo");
    const lex = await tables.getById<UserRow>("users", "users", "u-lex");
    expect(await hasher.verify("wpw2", waldo!.password_hash)).toBe(true);
    expect(await hasher.verify("lpw2", lex!.password_hash)).toBe(true);
  });

  it("skips users whose env-var lookup is undefined or empty (updated:false)", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({ rowKey: "u-waldo", name: "Waldo", is_admin: true }),
      makeUser({
        rowKey: "u-lex",
        name: "Lex",
        password_hash: "fake$s0099$keep-me",
      }),
      makeUser({
        rowKey: "u-mats",
        name: "Mats",
        password_hash: "fake$s0098$keep-me-too",
      }),
    ]);
    // Only Waldo has a password set; Lex is "", Mats is undefined.
    const passwords: Record<string, string> = { Waldo: "wpw2", Lex: "" };

    const results = await resetPasswordsBulk({
      tables,
      hasher,
      getPassword: (n) => passwords[n],
    });

    const byName = new Map(results.map((r) => [r.name, r]));
    expect(byName.get("Waldo")?.updated).toBe(true);
    expect(byName.get("Lex")?.updated).toBe(false);
    expect(byName.get("Mats")?.updated).toBe(false);

    // Skipped users' hashes must be preserved exactly.
    const lex = await tables.getById<UserRow>("users", "users", "u-lex");
    const mats = await tables.getById<UserRow>("users", "users", "u-mats");
    expect(lex!.password_hash).toBe("fake$s0099$keep-me");
    expect(mats!.password_hash).toBe("fake$s0098$keep-me-too");
  });

  it("throws BulkNoOpError when zero users have a non-empty password", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    await seedRoster(tables, [
      makeUser({ rowKey: "u-waldo", name: "Waldo", is_admin: true }),
      makeUser({ rowKey: "u-lex", name: "Lex" }),
    ]);

    const err = await resetPasswordsBulk({
      tables,
      hasher,
      getPassword: () => undefined,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BulkNoOpError);
    const e = err as BulkNoOpError;
    expect(e.message).not.toMatch(/waldo|lex|mats|ben|kaat|amaryllis/i);
  });
});
