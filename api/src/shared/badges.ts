export const BADGE_IDS = {
  ON_FIRE:       "on_fire",
  PERFECTIONIST: "perfectionist",
  SHUTTERBUG:    "shutterbug",
  BIG_BRAIN:     "big_brain",
  BOSS_SLAYER:   "boss_slayer",
  BOOKWORM:      "bookworm",
} as const;

export type BadgeId = typeof BADGE_IDS[keyof typeof BADGE_IDS];

export interface BadgeCheckState {
  streak: number;
  totalCardsStudied: number;
  perfectSession: boolean;
  firstPhotoImport: boolean;
  bossRoundComplete: boolean;
  cardsAtHighMastery: number;
  existingBadges: string[];
}

export function checkBadges(state: BadgeCheckState): BadgeId[] {
  const already = new Set(state.existingBadges);
  const earned: BadgeId[] = [];

  function award(id: BadgeId, condition: boolean) {
    if (condition && !already.has(id)) earned.push(id);
  }

  award(BADGE_IDS.ON_FIRE,       state.streak >= 7);
  award(BADGE_IDS.PERFECTIONIST, state.perfectSession);
  award(BADGE_IDS.SHUTTERBUG,    state.firstPhotoImport);
  award(BADGE_IDS.BIG_BRAIN,     state.cardsAtHighMastery >= 50);
  award(BADGE_IDS.BOSS_SLAYER,   state.bossRoundComplete);
  award(BADGE_IDS.BOOKWORM,      state.totalCardsStudied >= 500);

  return earned;
}
