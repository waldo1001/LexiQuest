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

  it("with cardLimit=null returns the full deck — every card, always", () => {
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
    // "All" now means all 31 cards (no due/new filter), so the session is never thin
    expect(result).toHaveLength(31);
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

  it("only includes cards with ease < 2.0 (no backfill when cardLimit=null)", () => {
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
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(1);
    expect(result[0].rowKey).toBe("hard");
  });

  it("excludes new cards (reps=0) from boss primary selection", () => {
    const hardOld = makeCard({
      rowKey: "hard-old",
      sm2_ease: 1.5,
      sm2_reps: 2,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
    });
    const newHard = makeCard({
      rowKey: "new-hard",
      sm2_ease: 1.3,
      sm2_reps: 0,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
    });
    const result = buildQueue([hardOld, newHard], {
      gameType: "boss_round",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // boss primary is reps>0 only; the primary is non-empty so there is no
    // fallback, and the new card is dropped entirely.
    expect(result.map((c) => c.rowKey)).toEqual(["hard-old"]);
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

  it("falls back to the deck (never empty) when no hard cards and cardLimit=null", () => {
    const easy = makeCard({
      rowKey: "easy",
      sm2_ease: 2.5,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
      sm2_reps: 2,
    });
    const result = buildQueue([easy], {
      gameType: "boss_round",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // No hard-due cards, but the course has a card — never strand the user.
    expect(result).toHaveLength(1);
    expect(result[0].rowKey).toBe("easy");
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

  it("primary selection is only overdue cards, sorted most-overdue-first", () => {
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
      cardLimit: null,
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

  it("excludes new cards (reps=0) from review_blitz primary selection", () => {
    const overdueOld = makeCard({
      rowKey: "overdue-old",
      sm2_reps: 2,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
    });
    const overdueNew = makeCard({
      rowKey: "overdue-new",
      sm2_reps: 0,
      next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
    });
    const result = buildQueue([overdueOld, overdueNew], {
      gameType: "review_blitz",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // review_blitz primary includes overdue reps>0 only; the primary is
    // non-empty so there is no fallback and the new card is dropped.
    expect(result.map((c) => c.rowKey)).toEqual(["overdue-old"]);
  });
});

describe("buildQueue — cardOrder (sequential vs random)", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  // Three due cards whose insertion (created_at) order differs from input order.
  function deckCards(): CardRow[] {
    const due = (rowKey: string, created_at: string): CardRow =>
      makeCard({
        rowKey,
        created_at,
        next_review_at: new Date("2026-01-10T12:00:00Z").toISOString(),
        sm2_reps: 2,
      });
    // Input order C, A, B — created_at order A, B, C.
    return [
      due("C", "2026-01-03T00:00:00Z"),
      due("A", "2026-01-01T00:00:00Z"),
      due("B", "2026-01-02T00:00:00Z"),
    ];
  }

  it("classic with cardOrder 'sequential' returns selected cards in created_at order without shuffling", () => {
    let shuffleCalled = false;
    const spyShuffle = <T>(arr: readonly T[]): T[] => {
      shuffleCalled = true;
      return [...arr].reverse();
    };
    const result = buildQueue(deckCards(), {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: spyShuffle,
      cardOrder: "sequential",
    });
    expect(shuffleCalled).toBe(false);
    expect(result.map((c) => c.rowKey)).toEqual(["A", "B", "C"]);
  });

  it("classic with cardOrder 'random' shuffles the selected set as before", () => {
    let shuffleCalled = false;
    const spyShuffle = <T>(arr: readonly T[]): T[] => {
      shuffleCalled = true;
      return [...arr].reverse();
    };
    const result = buildQueue(deckCards(), {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: spyShuffle,
      cardOrder: "random",
    });
    expect(shuffleCalled).toBe(true);
    // reversed input order C,A,B -> B,A,C
    expect(result.map((c) => c.rowKey)).toEqual(["B", "A", "C"]);
  });

  it("classic defaults to hardest_first order when cardOrder is omitted", () => {
    const cards: CardRow[] = [
      makeCard({ rowKey: "easy", sm2_ease: 2.5, next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
      makeCard({ rowKey: "hard", sm2_ease: 1.4, next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
      makeCard({ rowKey: "medium", sm2_ease: 1.9, next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
    ];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // hardest first: hard(1.4), medium(1.9); then the easy 2.5 card
    expect(result.map((c) => c.rowKey)).toEqual(["hard", "medium", "easy"]);
  });

  it("sequential order breaks created_at ties by card id ascending", () => {
    const sameTime = "2026-01-05T00:00:00Z";
    const cards: CardRow[] = [
      makeCard({ rowKey: "z-card", created_at: sameTime, next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
      makeCard({ rowKey: "a-card", created_at: sameTime, next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
    ];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
      cardOrder: "sequential",
    });
    expect(result.map((c) => c.rowKey)).toEqual(["a-card", "z-card"]);
  });
});

describe("backfill — always fill to cardLimit", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  // Helper: create a not-yet-due card with given ease/reps (the "backfill pool")
  function futureCard(id: string, ease: number, reps: number): CardRow {
    return makeCard({
      rowKey: id,
      sm2_ease: ease,
      sm2_reps: reps,
      next_review_at: new Date("2026-02-01T12:00:00Z").toISOString(),
    });
  }

  it("classic backfills to cardLimit when not enough due + new cards", () => {
    const due = [
      makeCard({ rowKey: "due-1", next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
    ];
    const newCards = [
      makeCard({ rowKey: "new-1", next_review_at: "2026-01-20T12:00:00Z", sm2_reps: 0 }),
    ];
    const future = [
      futureCard("future-easy", 2.5, 10),
      futureCard("future-hard", 1.4, 5),
      futureCard("future-medium", 2.0, 3),
    ];
    const result = buildQueue([...due, ...newCards, ...future], {
      gameType: "classic",
      cardLimit: 5,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(5);
  });

  it("classic with cardLimit=null now returns the whole deck (always a full session)", () => {
    const due = [
      makeCard({ rowKey: "due-1", next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
    ];
    const future = [
      futureCard("future-1", 2.5, 10),
      futureCard("future-2", 2.5, 10),
    ];
    const result = buildQueue([...due, ...future], {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // "All" pads with the two learned cards instead of returning just the 1 due card
    expect(result).toHaveLength(3);
  });

  it("classic orders the selected set hardest-first (low ease leads, easy tail behind)", () => {
    const cards = [
      futureCard("easy-veteran", 2.5, 10),
      futureCard("hard-practiced", 1.4, 5),   // hardest
      futureCard("never-studied", 2.5, 0),
      futureCard("medium", 2.0, 3),           // second-hardest
    ];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: 4,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(4);
    // hard cards (ease<2.5) lead in ease order; the 2.5 "easy" cards form the (noop-)shuffled tail
    expect(result.map((c) => c.rowKey)).toEqual([
      "hard-practiced",
      "medium",
      "never-studied",
      "easy-veteran",
    ]);
  });

  it("classic 'All' leads with the hardest even when it is not due, and includes every card", () => {
    const dueEasy = makeCard({ rowKey: "due-easy", sm2_ease: 2.5, sm2_reps: 2, next_review_at: "2026-01-10T12:00:00Z" });
    const learnedHard = makeCard({ rowKey: "learned-hard", sm2_ease: 1.3, sm2_reps: 6, next_review_at: "2026-02-01T12:00:00Z" });
    const result = buildQueue([dueEasy, learnedHard], {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result.map((c) => c.rowKey)).toEqual(["learned-hard", "due-easy"]);
  });

  it("speed_round backfills to cardLimit", () => {
    const due = [
      makeCard({ rowKey: "due-1", next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
    ];
    const future = [
      futureCard("future-hard", 1.4, 5),
      futureCard("future-easy", 2.5, 10),
    ];
    const result = buildQueue([...due, ...future], {
      gameType: "speed_round",
      cardLimit: 3,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(3);
  });

  it("boss_round backfills to cardLimit when not enough hard cards", () => {
    const hard = makeCard({
      rowKey: "hard",
      sm2_ease: 1.5,
      next_review_at: "2026-01-10T12:00:00Z",
      sm2_reps: 2,
    });
    const notHard = [
      futureCard("medium", 2.0, 3),
      futureCard("easy", 2.5, 10),
    ];
    const result = buildQueue([hard, ...notHard], {
      gameType: "boss_round",
      cardLimit: 3,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(3);
    // Hard card first (primary), then backfill by weakness
    expect(result[0].rowKey).toBe("hard");
    expect(result[1].rowKey).toBe("medium");
    expect(result[2].rowKey).toBe("easy");
  });

  it("review_blitz backfills to cardLimit when not enough overdue", () => {
    const overdue = makeCard({
      rowKey: "overdue",
      next_review_at: "2026-01-10T12:00:00Z",
      sm2_reps: 2,
    });
    const future = [
      futureCard("future-hard", 1.4, 5),
      futureCard("future-easy", 2.5, 10),
    ];
    const result = buildQueue([overdue, ...future], {
      gameType: "review_blitz",
      cardLimit: 3,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(3);
    expect(result[0].rowKey).toBe("overdue");
  });

  it("returns all cards when total cards < cardLimit", () => {
    const cards = [
      makeCard({ rowKey: "due-1", next_review_at: "2026-01-10T12:00:00Z", sm2_reps: 2 }),
      futureCard("future-1", 2.0, 3),
    ];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: 20,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(2); // can't exceed total cards
  });

  it("boss_round with cardLimit=null falls back hardest-first when no hard-due cards", () => {
    const cards = [
      futureCard("less-hard", 1.9, 4),
      futureCard("harder", 1.4, 4),
    ];
    const result = buildQueue(cards, {
      gameType: "boss_round",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // Both not due -> boss primary empty -> never-empty fallback, lowest ease first.
    expect(result.map((c) => c.rowKey)).toEqual(["harder", "less-hard"]);
  });
});

describe("buildQueue — never empty (hardest-first fallback)", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  // A learned card: studied (reps>0) and not due until well into the future.
  function learned(rowKey: string, ease: number): CardRow {
    return makeCard({
      rowKey,
      sm2_ease: ease,
      sm2_reps: 5,
      next_review_at: new Date("2026-02-01T12:00:00Z").toISOString(),
    });
  }

  it("classic/null: an all-learned deck is non-empty, hardest (lowest ease) first", () => {
    const cards = [learned("a", 2.5), learned("b", 1.4), learned("c", 1.9)];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    // hard cards (ease<2.5) first, lowest ease first: b(1.4), c(1.9); then easy a(2.5)
    expect(result.map((c) => c.rowKey)).toEqual(["b", "c", "a"]);
  });

  it("shuffles only the easy (never-failed) tail, keeps the hard head ordered", () => {
    const reverse = <T,>(arr: readonly T[]): T[] => [...arr].reverse();
    const cards = [
      learned("hard-1", 1.3),
      learned("hard-2", 1.6),
      learned("easy-1", 2.5),
      learned("easy-2", 2.6),
    ];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: reverse,
    });
    // hard head stays in ease order; easy tail (2.5, 2.6) goes through shuffle (reverse)
    expect(result.map((c) => c.rowKey)).toEqual(["hard-1", "hard-2", "easy-2", "easy-1"]);
  });

  it("breaks ease ties by card id for deterministic order", () => {
    const cards = [learned("z", 1.5), learned("a", 1.5)];
    const result = buildQueue(cards, {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result.map((c) => c.rowKey)).toEqual(["a", "z"]);
  });

  it.each(["classic", "boss_round", "speed_round", "review_blitz"] as const)(
    "%s with cardLimit=null never returns empty when cards exist",
    (gameType) => {
      const cards = [learned("easy", 2.5), learned("hard", 1.5)];
      const result = buildQueue(cards, { gameType, cardLimit: null, now, shuffle: noopShuffle });
      expect(result.length).toBeGreaterThan(0);
    },
  );

  it("returns empty for a truly empty deck (no cards at all)", () => {
    const result = buildQueue([], {
      gameType: "classic",
      cardLimit: null,
      now,
      shuffle: noopShuffle,
    });
    expect(result).toHaveLength(0);
  });
});
