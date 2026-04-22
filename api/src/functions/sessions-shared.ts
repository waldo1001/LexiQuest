import type { Entity } from "../shared/table-storage.js";

export type SessionMode = "self_grade" | "mcq" | "mixed" | "ask";
const SESSION_MODES = new Set<SessionMode>(["self_grade", "mcq", "mixed", "ask"]);

export interface SessionRow extends Entity {
  partitionKey: string; // = user_id
  rowKey: string;       // = {iso_started_at}_{id}
  user_id: string;
  course_id: string;
  mode: SessionMode;
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

  return { ok: true, value: { courseId: src.courseId.trim(), mode: src.mode as SessionMode } };
}

export interface SessionProfile {
  id: string;
  user_id: string;
  course_id: string;
  mode: SessionMode;
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
