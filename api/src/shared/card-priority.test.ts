import { describe, it, expect } from "vitest";
import { scoreCard, buildQueue, type QueueOptions } from "./card-priority.js";
import type { CardRow } from "../functions/cards-shared.js";

const DAY_MS = 86_400_000;

function makeCard(overrides: Partial<CardRow> = {}): CardRow {
  return {
    partitionKey: "course-1",
    rowKey: overrides.rowKey ?? "card-1",
    course_id: "course-1",
    question: "Q",
    answer: "A",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 10,
    sm2_reps: 3,
    next_review_at: new Date(Date.now() - DAY_MS).toISOString(), // due yesterday
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function noopShuffle<T>(arr: readonly T[]): T[] {
  return [...arr];
}

describe("scoreCard", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("returns higher score for more overdue cards", () => {
    const recent = makeCard({
      next_review_at: new Date("2026-01-14T12:00:00Z").toISOString(), // 1 day overdue
      sm2_interval: 10,
      sm2_ease: 2.5,
      sm2_reps: 3,
    });
    const stale = makeCard({
      next_review_at: new Date("2026-01-05T12:00:00Z").toISOString(), // 10 days overdue
      sm2_interval: 10,
      sm2_ease: 2.5,
      sm2_reps: 3,
    });
    expect(scoreCard(stale, now)).toBeGreaterThan(scoreCard(recent, now));
  });

  it("returns higher score for lower ease", () => {
    const hard = makeCard({
      next_review_at: new Date("2026-01-14T12:00:00Z").toISOString(),
      sm2_interval: 10,
      sm2_ease: 1.3,
      sm2_reps: 3,
    });
    const easy = makeCard({
      next_review_at: new Date("2026-01-14T12:00:00Z").toISOString(),
      sm2_interval: 10,
      sm2_ease: 2.5,
      sm2_reps: 3,
    });
    expect(scoreCard(hard, now)).toBeGreaterThan(scoreCard(easy, now));
  });

  it("returns 0 for cards not yet due", () => {
    const future = makeCard({
      next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
      sm2_interval: 10,
      sm2_reps: 3,
    });
    expect(scoreCard(future, now)).toBe(0);
  });

  it("returns positive score for new cards (reps=0) that are due", () => {
    const newDue = makeCard({
      next_review_at: new Date("2026-01-14T12:00:00Z").toISOString(),
      sm2_interval: 0,
      sm2_reps: 0,
    });
    expect(scoreCard(newDue, now)).toBeGreaterThan(0);
  });
});

describe("buildQueue — classic", () => {
  const now = new Date("2026-01-15T12:00:00Z");
  const baseOpts: QueueOptions = {
    gameType: "classic",
    cardLimit: null,
    now,
    shuffle: noopShuffle,
  };

  it("with cardLimit=null returns all due + up to 20 new (backward compat)", () => {
    const due = Array.from({ length: 5 }, (_, i) =>
      makeCard({
        rowKey: `due-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const newCards = Array.from({ length: 25 }, (_, i) =>
      makeCard({
        rowKey: `new-${i}`,
        next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
        sm2_reps: 0,
      }),
    );
    const future = [
      makeCard({
        rowKey: "future-1",
        next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
        sm2_reps: 3,
      }),
    ];
    const result = buildQueue([...due, ...newCards, ...future], baseOpts);
    // 5 due + 20 new (capped) = 25
    expect(result).toHaveLength(25);
    expect(result.filter((c) => c.sm2_reps === 0)).toHaveLength(20);
  });

  it("with cardLimit=10 returns exactly 10 cards", () => {
    const cards = Array.from({ length: 50 }, (_, i) =>
      makeCard({
        rowKey: `card-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const result = buildQueue(cards, { ...baseOpts, cardLimit: 10 });
    expect(result).toHaveLength(10);
  });

  it("fills with new cards when not enough due cards", () => {
    const due = [
      makeCard({
        rowKey: "due-0",
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    ];
    const newCards = Array.from({ length: 30 }, (_, i) =>
      makeCard({
        rowKey: `new-${i}`,
        next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
        sm2_reps: 0,
      }),
    );
    const result = buildQueue([...due, ...newCards], { ...baseOpts, cardLimit: 10 });
    expect(result).toHaveLength(10);
    expect(result.filter((c) => c.sm2_reps === 0).length).toBeGreaterThanOrEqual(1);
  });

  it("calls shuffle on the output", () => {
    let shuffled = false;
    const mockShuffle = <T>(arr: readonly T[]): T[] => {
      shuffled = true;
      return [...arr].reverse();
    };
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeCard({
        rowKey: `card-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    buildQueue(cards, { ...baseOpts, shuffle: mockShuffle });
    expect(shuffled).toBe(true);
  });
});

describe("buildQueue — boss_round", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("only includes cards with ease < 2.0", () => {
    const hard = makeCard({
      rowKey: "hard",
      sm2_ease: 1.5,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const easy = makeCard({
      rowKey: "easy",
      sm2_ease: 2.5,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const result = buildQueue([hard, easy], {
      gameType: "boss_round",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(1);
    expect(result[0].rowKey).toBe("hard");
  });

  it("excludes new cards", () => {
    const newHard = makeCard({
      rowKey: "new-hard",
      sm2_ease: 1.3,
      sm2_reps: 0,
      next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
    });
    const result = buildQueue([newHard], {
      gameType: "boss_round",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(0);
  });

  it("with null cardLimit returns all hard cards", () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeCard({
        rowKey: `hard-${i}`,
        sm2_ease: 1.5,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const result = buildQueue(cards, {
      gameType: "boss_round",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(5);
  });

  it("returns empty when no hard cards exist", () => {
    const easy = makeCard({
      rowKey: "easy",
      sm2_ease: 2.5,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const result = buildQueue([easy], {
      gameType: "boss_round",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(0);
  });
});

describe("buildQueue — speed_round", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("with null cardLimit defaults to 50", () => {
    const cards = Array.from({ length: 60 }, (_, i) =>
      makeCard({
        rowKey: `card-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const result = buildQueue(cards, {
      gameType: "speed_round",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(50);
  });

  it("caps at cardLimit and does not shuffle", () => {
    let shuffleCalled = false;
    const cards = Array.from({ length: 30 }, (_, i) =>
      makeCard({
        rowKey: `card-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const result = buildQueue(cards, {
      gameType: "speed_round",
      cardLimit: 15,
      now,
      shuffle: () => { shuffleCalled = true; return []; },
    });
    expect(result).toHaveLength(15);
    expect(shuffleCalled).toBe(false);
  });
});

describe("buildQueue — review_blitz", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("only includes overdue cards, sorted most-overdue-first", () => {
    const veryOverdue = makeCard({
      rowKey: "very-overdue",
      next_review_at: new Date("2026-01-01T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const slightlyOverdue = makeCard({
      rowKey: "slightly-overdue",
      next_review_at: new Date("2026-01-14T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const notDue = makeCard({
      rowKey: "not-due",
      next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const newCard = makeCard({
      rowKey: "new",
      sm2_reps: 0,
      next_review_at: new Date("2026-01-20T12:00:00Z").toISOString(),
    });
    const result = buildQueue([slightlyOverdue, notDue, veryOverdue, newCard], {
      gameType: "review_blitz",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(2);
    expect(result[0].rowKey).toBe("very-overdue");
    expect(result[1].rowKey).toBe("slightly-overdue");
  });

  it("with null cardLimit returns all overdue", () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeCard({
        rowKey: `overdue-${i}`,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      }),
    );
    const result = buildQueue(cards, {
      gameType: "review_blitz",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(5);
  });

  it("excludes new cards even if overdue", () => {
    const overdueNew = makeCard({
      rowKey: "overdue-new",
      sm2_reps: 0,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
    });
    const result = buildQueue([overdueNew], {
      gameType: "review_blitz",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    // review_blitz includes overdue cards with reps > 0 only
    expect(result).toHaveLength(0);
  });
});
