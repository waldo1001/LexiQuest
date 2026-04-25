import type { CardRow } from "../functions/cards-shared.js";

export type GameType = "classic" | "boss_round" | "speed_round" | "review_blitz";
export const GAME_TYPES = new Set<GameType>(["classic", "boss_round", "speed_round", "review_blitz"]);

export interface QueueOptions {
  gameType: GameType;
  cardLimit: number | null;
  now: Date;
  shuffle: <T>(arr: readonly T[]) => T[];
}

const DAY_MS = 86_400_000;
const MAX_NEW_CARDS = 20;
const OVERDUE_WEIGHT = 0.7;
const MASTERY_WEIGHT = 0.3;
const BOSS_EASE_THRESHOLD = 2.0;

export function scoreCard(card: CardRow, now: Date): number {
  const dueMs = new Date(card.next_review_at).getTime();
  const nowMs = now.getTime();
  if (dueMs > nowMs) return 0;

  const intervalMs = Math.max(card.sm2_interval, 1) * DAY_MS;
  const overdueRatio = Math.min(2, (nowMs - dueMs) / intervalMs);
  const masteryScore = (3.0 - card.sm2_ease) / 1.7 + 1.0 / (card.sm2_reps + 1);

  return OVERDUE_WEIGHT * overdueRatio + MASTERY_WEIGHT * masteryScore;
}

export function buildQueue(cards: CardRow[], opts: QueueOptions): CardRow[] {
  switch (opts.gameType) {
    case "classic":
      return buildClassic(cards, opts);
    case "boss_round":
      return buildBossRound(cards, opts);
    case "speed_round":
      return buildSpeedRound(cards, opts);
    case "review_blitz":
      return buildReviewBlitz(cards, opts);
  }
}

function buildClassic(cards: CardRow[], opts: QueueOptions): CardRow[] {
  const nowIso = opts.now.toISOString();
  const dueCards = cards.filter((c) => c.next_review_at <= nowIso);
  const newCards = cards.filter((c) => c.sm2_reps === 0 && c.next_review_at > nowIso);

  if (opts.cardLimit === null) {
    // Backward compat: all due + up to MAX_NEW_CARDS new
    return opts.shuffle([...dueCards, ...newCards.slice(0, MAX_NEW_CARDS)]);
  }

  // Score and sort due cards by priority
  const scored = dueCards
    .map((c) => ({ card: c, score: scoreCard(c, opts.now) }))
    .sort((a, b) => b.score - a.score);

  // Reserve ~25% for new cards, but fill with due if not enough new
  const newSlots = Math.min(newCards.length, Math.floor(opts.cardLimit * 0.25));
  const dueSlots = Math.min(scored.length, opts.cardLimit - newSlots);
  const selectedDue = scored.slice(0, dueSlots).map((s) => s.card);
  const remaining = opts.cardLimit - selectedDue.length;
  const selectedNew = newCards.slice(0, remaining);

  return opts.shuffle([...selectedDue, ...selectedNew]);
}

function buildBossRound(cards: CardRow[], opts: QueueOptions): CardRow[] {
  const nowIso = opts.now.toISOString();
  // Only due cards with low ease, no new cards
  const hard = cards.filter(
    (c) => c.sm2_reps > 0 && c.next_review_at <= nowIso && c.sm2_ease < BOSS_EASE_THRESHOLD,
  );
  hard.sort((a, b) => a.sm2_ease - b.sm2_ease);
  const limit = opts.cardLimit ?? hard.length;
  return hard.slice(0, limit);
}

function buildSpeedRound(cards: CardRow[], opts: QueueOptions): CardRow[] {
  const nowIso = opts.now.toISOString();
  const dueCards = cards.filter((c) => c.next_review_at <= nowIso);
  const newCards = cards.filter((c) => c.sm2_reps === 0 && c.next_review_at > nowIso);
  const limit = opts.cardLimit ?? 50;

  const scored = dueCards
    .map((c) => ({ card: c, score: scoreCard(c, opts.now) }))
    .sort((a, b) => b.score - a.score);

  // Fill with as many due cards as possible, then new cards for remaining slots
  const selectedDue = scored.slice(0, limit).map((s) => s.card);
  const remaining = limit - selectedDue.length;
  const selectedNew = newCards.slice(0, remaining);

  // No shuffle for speed round — sorted by priority
  return [...selectedDue, ...selectedNew].slice(0, limit);
}

function buildReviewBlitz(cards: CardRow[], opts: QueueOptions): CardRow[] {
  const nowIso = opts.now.toISOString();
  // Only overdue cards with reps > 0 (not new)
  const overdue = cards.filter(
    (c) => c.sm2_reps > 0 && c.next_review_at <= nowIso,
  );
  // Sort most overdue first
  overdue.sort((a, b) => {
    const aMs = new Date(a.next_review_at).getTime();
    const bMs = new Date(b.next_review_at).getTime();
    return aMs - bMs; // earlier = more overdue
  });
  const limit = opts.cardLimit ?? overdue.length;
  return overdue.slice(0, limit);
}
