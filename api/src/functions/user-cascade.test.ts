import { describe, it, expect, beforeEach } from "vitest";
import { deleteUserAndCascade } from "./user-cascade.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import type { Entity } from "../shared/table-storage.js";
import type { UserRow, YearRow } from "../shared/seed.js";

interface CourseRow extends Entity {
  partitionKey: string;
  rowKey: string;
  name: string;
}

interface CardRow extends Entity {
  partitionKey: string;
  rowKey: string;
  question: string;
}

interface AttemptRow extends Entity {
  partitionKey: string;
  rowKey: string;
  correct: boolean;
}

interface SessionRow extends Entity {
  partitionKey: string;
  rowKey: string;
  ended_at: string | null;
}

function userRow(id: string, name: string): UserRow {
  return {
    partitionKey: "users",
    rowKey: id,
    name,
    password_hash: "fake$s0001$pw",
    is_admin: false,
    color: "#abc",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 10 },
    created_at: "2026-04-22T00:00:00.000Z",
  };
}

describe("deleteUserAndCascade", () => {
  let tables: FakeTableStorage;

  beforeEach(async () => {
    tables = new FakeTableStorage();
    await tables.upsert<UserRow>("users", userRow("u-target", "Target"));
    await tables.upsert<UserRow>("users", userRow("u-other", "Other"));
  });

  it("cascade-deletes a user with no child rows", async () => {
    await deleteUserAndCascade({ tables }, "u-target");
    const gone = await tables.getById<UserRow>("users", "users", "u-target");
    expect(gone).toBeNull();
  });

  it("cascade removes courses owned by the user", async () => {
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-target",
      rowKey: "c-1",
      name: "French",
    });
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-target",
      rowKey: "c-2",
      name: "Math",
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("courses", "u-target")).toBe(0);
  });

  it("cascade removes cards of the user's courses", async () => {
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-target",
      rowKey: "c-french",
      name: "French",
    });
    await tables.upsert<CardRow>("cards", {
      partitionKey: "c-french",
      rowKey: "card-1",
      question: "le chien",
    });
    await tables.upsert<CardRow>("cards", {
      partitionKey: "c-french",
      rowKey: "card-2",
      question: "le chat",
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("cards", "c-french")).toBe(0);
  });

  it("cascade removes attempts owned by the user", async () => {
    await tables.upsert<AttemptRow>("attempts", {
      partitionKey: "u-target",
      rowKey: "2026-04-22T09:00:00Z_a1",
      correct: true,
    });
    await tables.upsert<AttemptRow>("attempts", {
      partitionKey: "u-target",
      rowKey: "2026-04-22T09:01:00Z_a2",
      correct: false,
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("attempts", "u-target")).toBe(0);
  });

  it("cascade removes sessions owned by the user", async () => {
    await tables.upsert<SessionRow>("sessions", {
      partitionKey: "u-target",
      rowKey: "2026-04-22T09:00:00Z_s1",
      ended_at: null,
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("sessions", "u-target")).toBe(0);
  });

  it("cascade does not touch other users' rows", async () => {
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-target",
      rowKey: "c-target",
      name: "Target Course",
    });
    await tables.upsert<CardRow>("cards", {
      partitionKey: "c-target",
      rowKey: "card-t",
      question: "q",
    });
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-other",
      rowKey: "c-other",
      name: "Other Course",
    });
    await tables.upsert<CardRow>("cards", {
      partitionKey: "c-other",
      rowKey: "card-o",
      question: "q",
    });
    await tables.upsert<AttemptRow>("attempts", {
      partitionKey: "u-other",
      rowKey: "2026-04-22T09:00:00Z_ao",
      correct: true,
    });
    await tables.upsert<SessionRow>("sessions", {
      partitionKey: "u-other",
      rowKey: "2026-04-22T09:00:00Z_so",
      ended_at: null,
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("courses", "u-other")).toBe(1);
    expect(tables.size("cards", "c-other")).toBe(1);
    expect(tables.size("attempts", "u-other")).toBe(1);
    expect(tables.size("sessions", "u-other")).toBe(1);
  });

  it("cascade removes the user row", async () => {
    await deleteUserAndCascade({ tables }, "u-target");
    const stored = await tables.getById<UserRow>(
      "users",
      "users",
      "u-target",
    );
    expect(stored).toBeNull();
    const otherStill = await tables.getById<UserRow>(
      "users",
      "users",
      "u-other",
    );
    expect(otherStill).not.toBeNull();
  });

  it("cascade is idempotent — running twice is safe", async () => {
    await tables.upsert<CourseRow>("courses", {
      partitionKey: "u-target",
      rowKey: "c-french",
      name: "French",
    });
    await deleteUserAndCascade({ tables }, "u-target");
    // Second call should not throw.
    await expect(
      deleteUserAndCascade({ tables }, "u-target"),
    ).resolves.toBeUndefined();
  });

  it("cascade never touches years or other users", async () => {
    await tables.upsert<YearRow>("years", {
      partitionKey: "years",
      rowKey: "year-1",
      label: "2025-2026",
      is_current: true,
      start_date: "2025-09-01",
      end_date: "2026-06-30",
    });

    await deleteUserAndCascade({ tables }, "u-target");

    expect(tables.size("years", "years")).toBe(1);
    const other = await tables.getById<UserRow>("users", "users", "u-other");
    expect(other).not.toBeNull();
  });
});
