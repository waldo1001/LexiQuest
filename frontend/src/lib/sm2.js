const DAY_MS = 86_400_000;

/**
 * @typedef {{ sm2_ease: number, sm2_interval: number, sm2_reps: number }} Sm2Input
 * @typedef {{ ease: number, interval: number, reps: number, next_review_at: string }} Sm2Result
 */

/**
 * Applies the SM-2 spaced-repetition update.
 * quality: 5 = "Knew it", 0 = "Didn't know".
 * now is injected so the function stays pure and testable.
 *
 * @param {Sm2Input} card
 * @param {number} quality
 * @param {Date} now
 * @returns {Sm2Result}
 */
export function applySm2(card, quality, now) {
  let ease = card.sm2_ease;
  let interval = card.sm2_interval;
  let reps = card.sm2_reps;

  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  ease = Math.max(
    1.3,
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  const next_review_at = new Date(now.getTime() + interval * DAY_MS).toISOString();

  return { ease, interval, reps, next_review_at };
}
