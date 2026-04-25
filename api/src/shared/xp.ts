import type { GameType } from "./card-priority.js";

export const XP = {
  CORRECT_FIRST_TRY: 10,
  SESSION_COMPLETE: 20,
  PERFECT_SESSION: 30,
  DAILY_GOAL: 25,
  BOSS_ROUND_COMPLETE: 50,
} as const;

export const GAME_TYPE_MULTIPLIERS: Record<GameType, number> = {
  classic: 1.0,
  boss_round: 1.5,
  speed_round: 1.25,
  review_blitz: 1.0,
};

interface AttemptLike {
  correct: boolean;
  card_id: string;
  session_id: string;
}

interface SessionLike {
  cards_studied: number;
  cards_correct: number;
}

export function computeSessionXp(
  session: SessionLike,
  attempts: AttemptLike[],
  gameType: GameType = "classic",
): number {
  const multiplier = GAME_TYPE_MULTIPLIERS[gameType];
  let xp = XP.SESSION_COMPLETE;

  // Track first-try outcome per card
  const firstTry = new Map<string, boolean>();
  for (const a of attempts) {
    if (!firstTry.has(a.card_id)) {
      firstTry.set(a.card_id, a.correct);
    }
  }

  let firstTryCorrect = 0;
  for (const correct of firstTry.values()) {
    if (correct) firstTryCorrect++;
  }

  // Per-card XP with game type multiplier
  xp += Math.round(firstTryCorrect * XP.CORRECT_FIRST_TRY * multiplier);

  // Perfect session: all studied cards were correct on first try
  if (session.cards_studied > 0 && firstTryCorrect === session.cards_studied) {
    xp += XP.PERFECT_SESSION;
  }

  // Boss round completion bonus
  if (gameType === "boss_round") {
    xp += XP.BOSS_ROUND_COMPLETE;
  }

  return xp;
}
