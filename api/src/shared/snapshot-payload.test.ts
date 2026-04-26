import { describe, it, expect } from "vitest";
import { buildSnapshotPayload, KNOWN_TABLES } from "./snapshot-payload.js";
import {
  PARTITIONS,
  USER_OWNED_PARTITION,
} from "./table-partitions.js";

describe("KNOWN_TABLES", () => {
  it("matches PARTITIONS ∪ USER_OWNED_PARTITION", () => {
    const expected = new Set([
      ...Object.keys(PARTITIONS),
      ...Object.keys(USER_OWNED_PARTITION),
    ]);
    expect(new Set(KNOWN_TABLES)).toEqual(expected);
  });
});

describe("buildSnapshotPayload", () => {
  const nowIso = () => "2026-04-26T12:00:00.000Z";

  it("emits empty arrays for every known table when no entities given", () => {
    const payload = buildSnapshotPayload({
      source: "Azurite",
      nowIso,
      entities: {},
    });
    for (const t of KNOWN_TABLES) {
      expect(payload.tables[t]).toEqual([]);
    }
  });

  it("places entities under their named table keys", () => {
    const users = [{ partitionKey: "users", rowKey: "u1", name: "Waldo" }];
    const cards = [{ partitionKey: "c1", rowKey: "card1", q: "hi" }];
    const payload = buildSnapshotPayload({
      source: "Azurite",
      nowIso,
      entities: { users, cards },
    });
    expect(payload.tables.users).toEqual(users);
    expect(payload.tables.cards).toEqual(cards);
    expect(payload.tables.years).toEqual([]);
    expect(payload.tables.courses).toEqual([]);
    expect(payload.tables.attempts).toEqual([]);
    expect(payload.tables.sessions).toEqual([]);
  });

  it("stamps exportedAt from the injected clock", () => {
    const payload = buildSnapshotPayload({
      source: "Azurite",
      nowIso: () => "2030-01-02T03:04:05.000Z",
      entities: {},
    });
    expect(payload.exportedAt).toBe("2030-01-02T03:04:05.000Z");
  });

  it("records the source label verbatim", () => {
    const payload = buildSnapshotPayload({
      source: "stlexiquest",
      nowIso,
      entities: {},
    });
    expect(payload.source).toBe("stlexiquest");
  });

  it("includes every known table key even when input array is missing", () => {
    const payload = buildSnapshotPayload({
      source: "Azurite",
      nowIso,
      entities: { users: [{ partitionKey: "users", rowKey: "u1" }] },
    });
    for (const t of KNOWN_TABLES) {
      expect(payload.tables).toHaveProperty(t);
      expect(Array.isArray(payload.tables[t])).toBe(true);
    }
  });
});
