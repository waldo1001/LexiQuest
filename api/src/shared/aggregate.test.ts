import { describe, it, expect } from "vitest";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import {
  masteryBucket,
  groupByDay,
  rollingAverage,
  parseRange,
  fetchAttempts,
  fetchSessions,
  fetchCards,
} from "./aggregate.js";
import type { AttemptRow } from "../functions/attempts-shared.js";
import type { SessionRow } from "../functions/sessions-shared.js";
import type { CardRow } from "../functions/cards-shared.js";
import type { CourseRow } from "../functions/courses-shared.js";

// ─── masteryBucket ─────────────────────────────────────────────────────────

describe("masteryBucket", () => {
  it("new: reps === 0", () => {
    expect(masteryBucket({ sm2_reps: 0, sm2_interval: 0 })).toBe("new");
  });

  it("learning: reps >= 1 AND interval < 7", () => {
    expect(masteryBucket({ sm2_reps: 1, sm2_interval: 1 })).toBe("learning");
    expect(masteryBucket({ sm2_reps: 3, sm2_interval: 6 })).toBe("learning");
  });

  it("young: 7 <= interval < 21", () => {
    expect(masteryBucket({ sm2_reps: 2, sm2_interval: 7 })).toBe("young");
    expect(masteryBucket({ sm2_reps: 2, sm2_interval: 20 })).toBe("young");
  });

  it("mature: 21 <= interval < 60", () => {
    expect(masteryBucket({ sm2_reps: 4, sm2_interval: 21 })).toBe("mature");
    expect(masteryBucket({ sm2_reps: 4, sm2_interval: 59 })).toBe("mature");
  });

  it("mastered: interval >= 60", () => {
    expect(masteryBucket({ sm2_reps: 5, sm2_interval: 60 })).toBe("mastered");
    expect(masteryBucket({ sm2_reps: 8, sm2_interval: 120 })).toBe("mastered");
  });
});

// ─── groupByDay ────────────────────────────────────────────────────────────

describe("groupByDay", () => {
  it("buckets items by YYYY-MM-DD prefix of date string", () => {
    const items = [
      { ts: "2026-04-01T10:00:00.000Z" },
      { ts: "2026-04-01T15:00:00.000Z" },
      { ts: "2026-04-02T09:00:00.000Z" },
    ];
    const result = groupByDay(items, (i) => i.ts);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["2026-04-01"]).toHaveLength(2);
    expect(result["2026-04-02"]).toHaveLength(1);
  });

  it("returns empty object for empty array", () => {
    expect(groupByDay([], (i: { ts: string }) => i.ts)).toEqual({});
  });
});

// ─── rollingAverage ────────────────────────────────────────────────────────

describe("rollingAverage", () => {
  it("returns same-length array with windowed averages", () => {
    const result = rollingAverage([10, 20, 30, 40, 50], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeCloseTo(10);       // window=[10]
    expect(result[1]).toBeCloseTo(15);       // window=[10,20]
    expect(result[2]).toBeCloseTo(20);       // window=[10,20,30]
    expect(result[3]).toBeCloseTo(30);       // window=[20,30,40]
    expect(result[4]).toBeCloseTo(40);       // window=[30,40,50]
  });

  it("returns empty array for empty series", () => {
    expect(rollingAverage([], 3)).toEqual([]);
  });
});

// ─── parseRange ────────────────────────────────────────────────────────────

describe("parseRange", () => {
  const NOW = new Date("2026-04-23T12:00:00.000Z");

  it("7d — from is 7 days before now", () => {
    const { from, to } = parseRange("7d", NOW);
    expect(to.getTime()).toBe(NOW.getTime());
    expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000);
  });

  it("30d — from is 30 days before now", () => {
    const { from, to } = parseRange("30d", NOW);
    expect(to.getTime() - from.getTime()).toBe(30 * 86_400_000);
  });

  it("90d — from is 90 days before now", () => {
    const { from, to } = parseRange("90d", NOW);
    expect(to.getTime() - from.getTime()).toBe(90 * 86_400_000);
  });

  it("1y — from is 365 days before now", () => {
    const { from, to } = parseRange("1y", NOW);
    expect(to.getTime() - from.getTime()).toBe(365 * 86_400_000);
  });

  it("all/null — from is epoch", () => {
    const { from } = parseRange("all", NOW);
    expect(from.getTime()).toBe(0);
    const { from: from2 } = parseRange(null, NOW);
    expect(from2.getTime()).toBe(0);
  });
});

// ─── fetchAttempts ─────────────────────────────────────────────────────────

describe("fetchAttempts", () => {
  function makeAttempt(timestamp: string): AttemptRow {
    return {
      partitionKey: "u-1",
      rowKey: `${timestamp}_id-${timestamp}`,
      user_id: "u-1",
      card_id: "c-1",
      session_id: "s-1",
      correct: true,
      mode: "self_grade",
      response_time_ms: 1000,
      timestamp,
    };
  }

  it("returns attempts in the date range", async () => {
    const tables = new FakeTableStorage();
    await tables.upsert("attempts", makeAttempt("2026-04-01T10:00:00.000Z"));
    await tables.upsert("attempts", makeAttempt("2026-04-15T10:00:00.000Z"));
    await tables.upsert("attempts", makeAttempt("2026-04-30T10:00:00.000Z"));

    const from = new Date("2026-04-10T00:00:00.000Z");
    const to = new Date("2026-04-20T23:59:59.999Z");
    const result = await fetchAttempts(tables, "u-1", from, to);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe("2026-04-15T10:00:00.000Z");
  });

  it("returns empty array when no attempts in range", async () => {
    const tables = new FakeTableStorage();
    const from = new Date("2026-04-01T00:00:00.000Z");
    const to = new Date("2026-04-30T23:59:59.999Z");
    const result = await fetchAttempts(tables, "u-1", from, to);
    expect(result).toHaveLength(0);
  });
});

// ─── fetchSessions ─────────────────────────────────────────────────────────

describe("fetchSessions", () => {
  function makeSession(startedAt: string): SessionRow {
    return {
      partitionKey: "u-1",
      rowKey: `${startedAt}_id-${startedAt}`,
      user_id: "u-1",
      course_id: "course-1",
      mode: "self_grade",
      started_at: startedAt,
      ended_at: startedAt,
      cards_studied: 5,
      cards_correct: 4,
      xp_earned: 60,
      duration_seconds: 120,
    };
  }

  it("returns sessions in the date range", async () => {
    const tables = new FakeTableStorage();
    await tables.upsert("sessions", makeSession("2026-04-01T10:00:00.000Z"));
    await tables.upsert("sessions", makeSession("2026-04-15T10:00:00.000Z"));
    await tables.upsert("sessions", makeSession("2026-04-30T10:00:00.000Z"));

    const from = new Date("2026-04-10T00:00:00.000Z");
    const to = new Date("2026-04-20T23:59:59.999Z");
    const result = await fetchSessions(tables, "u-1", from, to);
    expect(result).toHaveLength(1);
    expect(result[0].started_at).toBe("2026-04-15T10:00:00.000Z");
  });
});

// ─── fetchCards ────────────────────────────────────────────────────────────

describe("fetchCards", () => {
  it("returns all cards across all courses for the user", async () => {
    const tables = new FakeTableStorage();

    const course1: CourseRow = {
      partitionKey: "u-1",
      rowKey: "course-a",
      user_id: "u-1",
      year_id: "y-1",
      name: "French",
      emoji: "🇫🇷",
      color: "#000",
      language: "fr-FR",
      default_mode: "self_grade",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const course2: CourseRow = {
      ...course1,
      rowKey: "course-b",
      name: "Math",
    };

    const card = (id: string, courseId: string): CardRow => ({
      partitionKey: courseId,
      rowKey: id,
      course_id: courseId,
      question: "Q",
      answer: "A",
      distractors: [],
      hint: null,
      source: "manual",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    await tables.upsert("courses", course1);
    await tables.upsert("courses", course2);
    await tables.upsert("cards", card("card-1", "course-a"));
    await tables.upsert("cards", card("card-2", "course-a"));
    await tables.upsert("cards", card("card-3", "course-b"));

    const result = await fetchCards(tables, "u-1");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when user has no courses", async () => {
    const tables = new FakeTableStorage();
    const result = await fetchCards(tables, "u-empty");
    expect(result).toHaveLength(0);
  });
});
