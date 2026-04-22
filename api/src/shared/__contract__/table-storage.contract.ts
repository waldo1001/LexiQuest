import { describe, it, expect, beforeEach } from "vitest";
import type { TableStorage } from "../table-storage.js";

type Factory = () => Promise<TableStorage> | TableStorage;

interface UserRow {
  partitionKey: "users";
  rowKey: string;
  name: string;
}

interface AttemptRow {
  partitionKey: string;
  rowKey: string;
  correct: boolean;
}

export function runTableStorageContract(
  label: string,
  factory: Factory,
): void {
  describe(`TableStorage contract — ${label}`, () => {
    let store: TableStorage;

    beforeEach(async () => {
      store = await factory();
    });

    it("getById returns null for missing rows", async () => {
      expect(await store.getById("users", "users", "nope")).toBeNull();
    });

    it("upsert persists an entity retrievable by partitionKey + rowKey", async () => {
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u1",
        name: "Alice",
      });
      const got = await store.getById<UserRow>("users", "users", "u1");
      expect(got?.name).toBe("Alice");
    });

    it("upsert replaces on same partitionKey + rowKey", async () => {
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u1",
        name: "Alice",
      });
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u1",
        name: "Bob",
      });
      const got = await store.getById<UserRow>("users", "users", "u1");
      expect(got?.name).toBe("Bob");
    });

    it("listByPartition returns all rows under the partitionKey", async () => {
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u1",
        name: "Alice",
      });
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u2",
        name: "Bob",
      });
      const rows = await store.listByPartition<UserRow>("users", "users");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.name).sort()).toEqual(["Alice", "Bob"]);
    });

    it("listByPartition returns [] for an empty partition", async () => {
      expect(await store.listByPartition("users", "users")).toEqual([]);
    });

    it("listByRowKeyRange filters inclusive on both bounds and returns sorted", async () => {
      const pk = "user-1";
      const rows: AttemptRow[] = [
        { partitionKey: pk, rowKey: "2026-04-01T00:00:00Z_a", correct: true },
        { partitionKey: pk, rowKey: "2026-04-15T00:00:00Z_b", correct: false },
        { partitionKey: pk, rowKey: "2026-04-30T00:00:00Z_c", correct: true },
      ];
      for (const r of rows) await store.upsert("attempts", r);

      const got = await store.listByRowKeyRange<AttemptRow>(
        "attempts",
        pk,
        "2026-04-10T00:00:00Z",
        "2026-04-20T00:00:00Z",
      );
      expect(got.map((r) => r.rowKey)).toEqual([
        "2026-04-15T00:00:00Z_b",
      ]);

      const inclusive = await store.listByRowKeyRange<AttemptRow>(
        "attempts",
        pk,
        "2026-04-01T00:00:00Z_a",
        "2026-04-30T00:00:00Z_c",
      );
      expect(inclusive).toHaveLength(3);
      expect(inclusive[0]!.rowKey < inclusive[2]!.rowKey).toBe(true);
    });

    it("remove deletes an existing row", async () => {
      await store.upsert<UserRow>("users", {
        partitionKey: "users",
        rowKey: "u1",
        name: "Alice",
      });
      await store.remove("users", "users", "u1");
      expect(await store.getById("users", "users", "u1")).toBeNull();
    });

    it("remove is a no-op for rows that don't exist", async () => {
      await expect(
        store.remove("users", "users", "never-existed"),
      ).resolves.toBeUndefined();
    });
  });
}
