export const XP = {
  CORRECT_FIRST_TRY: 10,
  SESSION_COMPLETE: 20,
  PERFECT_SESSION: 30,
  DAILY_GOAL: 25,
} as const;

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
): number {
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

  xp += firstTryCorrect * XP.CORRECT_FIRST_TRY;

  // Perfect session: all studied cards were correct on first try
  if (session.cards_studied > 0 && firstTryCorrect === session.cards_studied) {
    xp += XP.PERFECT_SESSION;
  }

  return xp;
}
