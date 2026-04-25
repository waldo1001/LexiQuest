import { describe, it, expect } from "vitest";
import { computeSessionXp, XP } from "./xp.js";

type AttemptLike = { correct: boolean; card_id: string; session_id: string };
type SessionLike = { cards_studied: number; cards_correct: number };

function attempt(cardId: string, correct: boolean, sessionId = "s1"): AttemptLike {
  return { card_id: cardId, correct, session_id: sessionId };
}

describe("computeSessionXp", () => {
  it("AC1: 10 XP per correct first-try card", () => {
    const session: SessionLike = { cards_studied: 3, cards_correct: 3 };
    const attempts: AttemptLike[] = [
      attempt("c1", true),
      attempt("c2", true),
      attempt("c3", true),
    ];
    // 3 correct first-try × 10 = 30, +20 session, +30 perfect = 80
    expect(computeSessionXp(session, attempts)).toBe(80);
  });

  it("AC2: no XP for correct-after-retry (second attempt on same card correct)", () => {
    const session: SessionLike = { cards_studied: 1, cards_correct: 0 };
    const attempts: AttemptLike[] = [
      attempt("c1", false),
      attempt("c1", true), // retry — correct after fail → 0 XP
    ];
    // 0 first-try correct, not a perfect session, +20 session
    expect(computeSessionXp(session, attempts)).toBe(20);
  });

  it("AC3: +20 session completion bonus always", () => {
    const session: SessionLike = { cards_studied: 5, cards_correct: 0 };
    const attempts: AttemptLike[] = Array.from({ length: 5 }, (_, i) =>
      attempt(`c${i}`, false),
    );
    expect(computeSessionXp(session, attempts)).toBe(20);
  });

  it("AC4: +30 perfect session bonus when all first-try correct", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 2 };
    const attempts: AttemptLike[] = [attempt("c1", true), attempt("c2", true)];
    // 2×10 + 20 session + 30 perfect = 70
    expect(computeSessionXp(session, attempts)).toBe(70);
  });

  it("AC5: mixed session (some correct, some not) — correct only for first-try corrects", () => {
    const session: SessionLike = { cards_studied: 3, cards_correct: 2 };
    const attempts: AttemptLike[] = [
      attempt("c1", true),
      attempt("c2", false),
      attempt("c3", true),
    ];
    // 2 first-try correct × 10 = 20, +20 session, no perfect bonus = 40
    expect(computeSessionXp(session, attempts)).toBe(40);
  });

  it("AC6: retry correct card does not count as first-try", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 1 };
    const attempts: AttemptLike[] = [
      attempt("c1", false),
      attempt("c1", true), // retry
      attempt("c2", true),
    ];
    // Only c2 is first-try correct → 1×10 + 20 = 30
    expect(computeSessionXp(session, attempts)).toBe(30);
  });

  it("AC7: XP constants are exported for use in UI", () => {
    expect(XP.CORRECT_FIRST_TRY).toBe(10);
    expect(XP.SESSION_COMPLETE).toBe(20);
    expect(XP.PERFECT_SESSION).toBe(30);
    expect(XP.DAILY_GOAL).toBe(25);
  });

  it("AC8: empty attempts array returns just session bonus", () => {
    const session: SessionLike = { cards_studied: 0, cards_correct: 0 };
    expect(computeSessionXp(session, [])).toBe(20);
  });
});

describe("computeSessionXp — game type multipliers", () => {
  it("classic mode XP unchanged (multiplier 1.0)", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 2 };
    const attempts: AttemptLike[] = [attempt("c1", true), attempt("c2", true)];
    expect(computeSessionXp(session, attempts, "classic")).toBe(70); // 2×10 + 20 + 30
  });

  it("boss_round: per-card XP multiplied by 1.5 + flat 50 bonus", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 2 };
    const attempts: AttemptLike[] = [attempt("c1", true), attempt("c2", true)];
    // 2 × 10 × 1.5 = 30 (per-card), +20 session, +30 perfect, +50 boss = 130
    expect(computeSessionXp(session, attempts, "boss_round")).toBe(130);
  });

  it("speed_round: per-card XP multiplied by 1.25", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 2 };
    const attempts: AttemptLike[] = [attempt("c1", true), attempt("c2", true)];
    // 2 × 10 × 1.25 = 25, +20 session, +30 perfect = 75
    expect(computeSessionXp(session, attempts, "speed_round")).toBe(75);
  });

  it("review_blitz: no multiplier", () => {
    const session: SessionLike = { cards_studied: 2, cards_correct: 2 };
    const attempts: AttemptLike[] = [attempt("c1", true), attempt("c2", true)];
    expect(computeSessionXp(session, attempts, "review_blitz")).toBe(70);
  });

  it("session/perfect bonuses NOT multiplied", () => {
    // All wrong — only session bonus, no card XP to multiply
    const session: SessionLike = { cards_studied: 2, cards_correct: 0 };
    const attempts: AttemptLike[] = [attempt("c1", false), attempt("c2", false)];
    expect(computeSessionXp(session, attempts, "boss_round")).toBe(70); // 20 session + 50 boss
  });

  it("defaults to classic when gameType omitted", () => {
    const session: SessionLike = { cards_studied: 1, cards_correct: 1 };
    const attempts: AttemptLike[] = [attempt("c1", true)];
    expect(computeSessionXp(session, attempts)).toBe(60); // 10 + 20 + 30
  });
});
