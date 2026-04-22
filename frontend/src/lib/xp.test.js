import { describe, it, expect } from "vitest";
import { computeSessionXp, XP } from "./xp.js";

function attempt(cardId, correct, sessionId = "s1") {
  return { card_id: cardId, correct, session_id: sessionId };
}

describe("computeSessionXp (frontend)", () => {
  it("3 correct first-try: 3×10 + 20 session + 30 perfect = 80", () => {
    expect(
      computeSessionXp({ cards_studied: 3, cards_correct: 3 }, [
        attempt("c1", true), attempt("c2", true), attempt("c3", true),
      ]),
    ).toBe(80);
  });

  it("retry-correct earns 0 XP for that card", () => {
    expect(
      computeSessionXp({ cards_studied: 1, cards_correct: 0 }, [
        attempt("c1", false), attempt("c1", true),
      ]),
    ).toBe(20);
  });

  it("XP constants match spec §5.7", () => {
    expect(XP.CORRECT_FIRST_TRY).toBe(10);
    expect(XP.SESSION_COMPLETE).toBe(20);
    expect(XP.PERFECT_SESSION).toBe(30);
    expect(XP.DAILY_GOAL).toBe(25);
  });
});
