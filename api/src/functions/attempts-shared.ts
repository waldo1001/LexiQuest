import type { Entity } from "../shared/table-storage.js";

export type AttemptMode = "self_grade" | "mcq";
const ATTEMPT_MODES = new Set<AttemptMode>(["self_grade", "mcq"]);

export interface AttemptRow extends Entity {
  partitionKey: string; // = user_id
  rowKey: string;       // = {iso_timestamp}_{id}
  user_id: string;
  card_id: string;
  session_id: string;
  correct: boolean;
  mode: AttemptMode;
  response_time_ms: number;
  timestamp: string;
}

export interface AttemptItem {
  cardId: string;
  correct: boolean;
  mode: AttemptMode;
  response_time_ms: number;
}

export interface AttemptsBody {
  sessionId: string;
  items: AttemptItem[];
}

export function validateAttemptsBody(
  body: unknown,
): { ok: true; value: AttemptsBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;

  if (typeof src.sessionId !== "string" || src.sessionId.trim().length === 0) {
    return { ok: false, error: "sessionId is required" };
  }
  if (!Array.isArray(src.items) || src.items.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }

  const items: AttemptItem[] = [];
  for (let i = 0; i < src.items.length; i++) {
    const item = src.items[i] as Record<string, unknown>;
    if (typeof item.cardId !== "string" || item.cardId.trim().length === 0) {
      return { ok: false, error: `items[${i}].cardId is required` };
    }
    if (typeof item.correct !== "boolean") {
      return { ok: false, error: `items[${i}].correct must be boolean` };
    }
    if (!ATTEMPT_MODES.has(item.mode as AttemptMode)) {
      return { ok: false, error: `items[${i}].mode must be self_grade or mcq` };
    }
    if (typeof item.response_time_ms !== "number" || item.response_time_ms < 0) {
      return { ok: false, error: `items[${i}].response_time_ms must be a non-negative number` };
    }
    items.push({
      cardId: item.cardId.trim(),
      correct: item.correct,
      mode: item.mode as AttemptMode,
      response_time_ms: item.response_time_ms,
    });
  }

  return { ok: true, value: { sessionId: src.sessionId.trim(), items } };
}

export function makeAttemptRowKey(timestamp: string, id: string): string {
  return `${timestamp}_${id}`;
}
