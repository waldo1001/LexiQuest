export const XP = {
  CORRECT_FIRST_TRY: 10,
  SESSION_COMPLETE: 20,
  PERFECT_SESSION: 30,
  DAILY_GOAL: 25,
};

/**
 * @param {{ cards_studied: number, cards_correct: number }} session
 * @param {{ correct: boolean, card_id: string }[]} attempts
 * @returns {number}
 */
export function computeSessionXp(session, attempts) {
  let xp = XP.SESSION_COMPLETE;

  const firstTry = new Map();
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

  if (session.cards_studied > 0 && firstTryCorrect === session.cards_studied) {
    xp += XP.PERFECT_SESSION;
  }

  return xp;
}
