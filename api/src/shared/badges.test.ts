import { describe, it, expect } from "vitest";
import { checkBadges, BADGE_IDS, type BadgeCheckState } from "./badges.js";

function state(overrides: Partial<BadgeCheckState> = {}): BadgeCheckState {
  return {
    streak: 0,
    totalCardsStudied: 0,
    perfectSession: false,
    firstPhotoImport: false,
    bossRoundComplete: false,
    cardsAtHighMastery: 0,
    existingBadges: [],
    ...overrides,
  };
}

describe("checkBadges", () => {
  it("AC1: awards On Fire badge at 7-day streak", () => {
    const result = checkBadges(state({ streak: 7 }));
    expect(result).toContain(BADGE_IDS.ON_FIRE);
  });

  it("AC2: does not award On Fire below 7-day streak", () => {
    expect(checkBadges(state({ streak: 6 }))).not.toContain(BADGE_IDS.ON_FIRE);
  });

  it("AC3: awards Perfectionist badge on perfect session", () => {
    const result = checkBadges(state({ perfectSession: true }));
    expect(result).toContain(BADGE_IDS.PERFECTIONIST);
  });

  it("AC4: awards Shutterbug badge on first photo import", () => {
    const result = checkBadges(state({ firstPhotoImport: true }));
    expect(result).toContain(BADGE_IDS.SHUTTERBUG);
  });

  it("AC5: awards Big Brain badge for 50 cards at high mastery", () => {
    const result = checkBadges(state({ cardsAtHighMastery: 50 }));
    expect(result).toContain(BADGE_IDS.BIG_BRAIN);
  });

  it("AC6: does not award Big Brain below threshold", () => {
    expect(checkBadges(state({ cardsAtHighMastery: 49 }))).not.toContain(BADGE_IDS.BIG_BRAIN);
  });

  it("AC7: awards Bookworm badge at 500 cards studied", () => {
    const result = checkBadges(state({ totalCardsStudied: 500 }));
    expect(result).toContain(BADGE_IDS.BOOKWORM);
  });

  it("AC8: awards Boss Slayer badge on boss round complete", () => {
    const result = checkBadges(state({ bossRoundComplete: true }));
    expect(result).toContain(BADGE_IDS.BOSS_SLAYER);
  });

  it("AC9: returns empty array when nothing earned", () => {
    expect(checkBadges(state())).toEqual([]);
  });

  it("AC10: does not re-award badges already in existingBadges", () => {
    const result = checkBadges(
      state({ streak: 7, existingBadges: [BADGE_IDS.ON_FIRE] }),
    );
    expect(result).not.toContain(BADGE_IDS.ON_FIRE);
  });

  it("AC11: can award multiple new badges at once", () => {
    const result = checkBadges(state({ streak: 7, perfectSession: true }));
    expect(result).toContain(BADGE_IDS.ON_FIRE);
    expect(result).toContain(BADGE_IDS.PERFECTIONIST);
  });

  it("AC12: BADGE_IDS constants are exported", () => {
    expect(BADGE_IDS.ON_FIRE).toBeDefined();
    expect(BADGE_IDS.PERFECTIONIST).toBeDefined();
    expect(BADGE_IDS.SHUTTERBUG).toBeDefined();
    expect(BADGE_IDS.BIG_BRAIN).toBeDefined();
    expect(BADGE_IDS.BOSS_SLAYER).toBeDefined();
    expect(BADGE_IDS.BOOKWORM).toBeDefined();
  });
});
