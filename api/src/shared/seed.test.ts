import { describe, it, expect } from "vitest";
import {
  SEED_USERS,
  SeedMissingPasswordError,
  seed,
  type UserRow,
  type YearRow,
} from "./seed.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakePasswordHasher } from "../../testing/fake-password-hasher.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";

const passwords: Record<string, string> = {
  Waldo: "wpw",
  Lex: "lpw",
  Mats: "mpw",
  Ben: "bpw",
  Kaat: "kpw",
  Amaryllis: "apw",
};

function make(partial: { random?: FakeRandom; clock?: FakeClock } = {}) {
  return {
    tables: new FakeTableStorage(),
    hasher: new FakePasswordHasher(),
    clock: partial.clock ?? new FakeClock("2026-04-22T09:00:00Z"),
    random:
      partial.random ??
      new FakeRandom([
        "u-waldo",
        "u-lex",
        "u-mats",
        "u-ben",
        "u-kaat",
        "u-amaryllis",
        "y-2025-2026",
      ]),
    getPassword: (name: string) => passwords[name],
  };
}

describe("seed", () => {
  it("inserts the full family roster when run against an empty store", async () => {
    const deps = make();
    const res = await seed(deps);
    expect(res.users).toHaveLength(6);
    expect(res.users.every((u) => u.created)).toBe(true);
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    expect(rows.map((r) => r.name).sort()).toEqual(
      ["Amaryllis", "Ben", "Kaat", "Lex", "Mats", "Waldo"],
    );
  });

  it("SEED_USERS lists Waldo as the only admin", () => {
    const names = SEED_USERS.map((s) => s.name).sort();
    expect(names).toEqual(["Amaryllis", "Ben", "Kaat", "Lex", "Mats", "Waldo"]);
    const admins = SEED_USERS.filter((s) => s.is_admin);
    expect(admins).toHaveLength(1);
    expect(admins[0]!.name).toBe("Waldo");
  });

  it("Kaat seed spec: amber colour, rabbit emoji, not admin", () => {
    const kaat = SEED_USERS.find((s) => s.name === "Kaat");
    expect(kaat).toBeDefined();
    expect(kaat!.is_admin).toBe(false);
    expect(kaat!.color).toBe("#f59e0b");
    expect(kaat!.avatar_emoji).toBe("🐰");
  });

  it("Amaryllis seed spec: pink colour, blossom emoji, not admin", () => {
    const amaryllis = SEED_USERS.find((s) => s.name === "Amaryllis");
    expect(amaryllis).toBeDefined();
    expect(amaryllis!.is_admin).toBe(false);
    expect(amaryllis!.color).toBe("#ec4899");
    expect(amaryllis!.avatar_emoji).toBe("🌸");
  });

  it("AVATAR-1: Waldo seed spec carries avatar_image_url /icons/icon-192.png", () => {
    const waldo = SEED_USERS.find((s) => s.name === "Waldo");
    expect(waldo).toBeDefined();
    expect(waldo!.avatar_image_url).toBe("/icons/icon-192.png");
  });

  it("AVATAR-2: after seed(), Waldo's stored row has avatar_image_url set", async () => {
    const deps = make();
    await seed(deps);
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    const waldo = rows.find((r) => r.name === "Waldo");
    expect(waldo).toBeDefined();
    expect(waldo!.avatar_image_url).toBe("/icons/icon-192.png");
  });

  it("AVATAR-3: after seed(), kid rows do NOT have avatar_image_url", async () => {
    const deps = make();
    await seed(deps);
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    for (const name of ["Lex", "Mats", "Ben", "Kaat", "Amaryllis"]) {
      const r = rows.find((row) => row.name === name);
      expect(r).toBeDefined();
      expect(r!.avatar_image_url).toBeUndefined();
    }
  });

  it("inserts a current year row", async () => {
    const deps = make();
    const res = await seed(deps);
    expect(res.year.created).toBe(true);
    const years = await deps.tables.listByPartition<YearRow>("years", "years");
    expect(years).toHaveLength(1);
    expect(years[0]!.is_current).toBe(true);
    expect(years[0]!.label).toBe("2025-2026");
    expect(years[0]!.start_date).toBe("2025-09-01");
    expect(years[0]!.end_date).toBe("2026-06-30");
  });

  it("computes a Sept-onwards label for a mid-October clock", async () => {
    const deps = make({ clock: new FakeClock("2026-10-10T09:00:00Z") });
    const res = await seed(deps);
    expect(res.year.label).toBe("2026-2027");
  });

  it("hashes passwords (stored value is not the plaintext)", async () => {
    const deps = make();
    await seed(deps);
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    // With FakePasswordHasher the hash is `fake$<salt>$<plaintext>`.
    // Assertion: the stored value is the hasher's output, not the
    // plaintext itself. Real bcrypt coverage lives in
    // password-hasher.bcrypt.test.ts.
    for (const r of rows) {
      expect(r.password_hash).not.toBe(passwords[r.name]);
      expect(r.password_hash.startsWith("fake$")).toBe(true);
      expect(await deps.hasher.verify(passwords[r.name]!, r.password_hash))
        .toBe(true);
    }
  });

  it("exactly one admin after seed", async () => {
    const deps = make();
    await seed(deps);
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    expect(rows.filter((r) => r.is_admin)).toHaveLength(1);
    expect(rows.find((r) => r.is_admin)?.name).toBe("Waldo");
  });

  it("idempotent on re-run", async () => {
    const tables = new FakeTableStorage();
    const hasher = new FakePasswordHasher();
    const clock = new FakeClock("2026-04-22T09:00:00Z");
    const random = new FakeRandom([
      "u-waldo",
      "u-lex",
      "u-mats",
      "u-ben",
      "u-kaat",
      "u-amaryllis",
      "y-1",
      // nothing scripted for re-run; should NOT be consumed
    ]);
    const getPassword = (n: string) => passwords[n];

    const first = await seed({ tables, hasher, clock, random, getPassword });
    expect(first.users.every((u) => u.created)).toBe(true);
    expect(first.year.created).toBe(true);

    const before = await tables.listByPartition<UserRow>("users", "users");

    const second = await seed({ tables, hasher, clock, random, getPassword });
    expect(second.users.every((u) => !u.created)).toBe(true);
    expect(second.year.created).toBe(false);

    const after = await tables.listByPartition<UserRow>("users", "users");
    expect(after).toEqual(before);
  });

  it("throws SeedMissingPasswordError with a redacted message", async () => {
    const deps = {
      tables: new FakeTableStorage(),
      hasher: new FakePasswordHasher(),
      clock: new FakeClock("2026-04-22T09:00:00Z"),
      random: new FakeRandom(["u-waldo"]),
      getPassword: () => undefined,
    };
    const err = await seed(deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SeedMissingPasswordError);
    const e = err as SeedMissingPasswordError;
    expect(e.message).not.toMatch(/waldo|lex|mats|ben|kaat|amaryllis/i);
    expect(e.message).not.toMatch(/wpw|lpw|mpw|bpw|kpw|apw/);
  });
});
