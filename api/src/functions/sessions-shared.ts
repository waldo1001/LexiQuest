import type { Entity } from "../shared/table-storage.js";
import { type GameType, GAME_TYPES, type CardOrder, CARD_ORDERS } from "../shared/card-priority.js";

export type SessionMode = "self_grade" | "mcq" | "mixed" | "ask";
const SESSION_MODES = new Set<SessionMode>(["self_grade", "mcq", "mixed", "ask"]);

export type { GameType, CardOrder };

export interface SessionRow extends Entity {
  partitionKey: string; // = user_id
  rowKey: string;       // = {iso_started_at}_{id}
  user_id: string;
  course_id: string;
  mode: SessionMode;
  game_type: GameType;
  card_limit: number | null;
  card_order: CardOrder;
  started_at: string;
  ended_at: string | null;
  cards_studied: number;
  cards_correct: number;
  xp_earned: number;
  duration_seconds: number;
}

export interface SessionCreateBody {
  courseId: string;
  mode: SessionMode;
  gameType: GameType;
  cardLimit: number | null;
  cardOrder: CardOrder;
  uploadId: string | null;
}

export function validateSessionCreate(
  body: unknown,
): { ok: true; value: SessionCreateBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;

  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }
  if (!SESSION_MODES.has(src.mode as SessionMode)) {
    return { ok: false, error: "mode must be one of: self_grade, mcq, mixed, ask" };
  }

  const gameType: GameType = (src.gameType as GameType) ?? "classic";
  if (!GAME_TYPES.has(gameType)) {
    return { ok: false, error: "gameType must be one of: classic, boss_round, speed_round, review_blitz" };
  }

  let cardLimit: number | null = null;
  if (src.cardLimit !== undefined && src.cardLimit !== null) {
    if (typeof src.cardLimit !== "number" || src.cardLimit <= 0) {
      return { ok: false, error: "cardLimit must be a positive number" };
    }
    cardLimit = src.cardLimit;
  }

  const cardOrder: CardOrder = (src.cardOrder as CardOrder) ?? "hardest_first";
  if (!CARD_ORDERS.has(cardOrder)) {
    return { ok: false, error: "cardOrder must be one of: hardest_first, random, sequential" };
  }

  const uploadId = typeof src.uploadId === "string" && src.uploadId.trim().length > 0
    ? src.uploadId.trim()
    : null;

  return {
    ok: true,
    value: {
      courseId: src.courseId.trim(),
      mode: src.mode as SessionMode,
      gameType,
      cardLimit,
      cardOrder,
      uploadId,
    },
  };
}

export interface SessionProfile {
  id: string;
  user_id: string;
  course_id: string;
  mode: SessionMode;
  game_type: GameType;
  card_limit: number | null;
  card_order: CardOrder;
  started_at: string;
  ended_at: string | null;
  cards_studied: number;
  cards_correct: number;
  xp_earned: number;
  duration_seconds: number;
}

export function sessionProfile(row: SessionRow): SessionProfile {
  return {
    id: rowKeyToId(row.rowKey),
    user_id: row.user_id,
    course_id: row.course_id,
    mode: row.mode,
    game_type: (row as unknown as Record<string, unknown>).game_type as GameType ?? "classic",
    card_limit: (row as unknown as Record<string, unknown>).card_limit as number ?? null,
    card_order: (row as unknown as Record<string, unknown>).card_order as CardOrder ?? "random",
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    cards_studied: row.cards_studied,
    cards_correct: row.cards_correct,
    xp_earned: row.xp_earned,
    duration_seconds: row.duration_seconds,
  };
}

export function makeSessionRowKey(startedAt: string, id: string): string {
  return `${startedAt}_${id}`;
}

export function rowKeyToId(rowKey: string): string {
  const idx = rowKey.indexOf("_");
  return idx === -1 ? rowKey : rowKey.slice(idx + 1);
}
