import type { Entity } from "../shared/table-storage.js";

export type CardSource = "manual" | "photo" | "ai_import";

const CARD_SOURCES = new Set<CardSource>(["manual", "photo", "ai_import"]);

export interface CardRow extends Entity {
  partitionKey: string; // = course_id
  rowKey: string;       // = card id
  course_id: string;
  question: string;
  answer: string;
  distractors: string[]; // serialized to JSON string in real storage
  hint: string | null;
  source: CardSource;
  sm2_ease: number;
  sm2_interval: number;
  sm2_reps: number;
  next_review_at: string; // ISO datetime
  created_at: string;     // ISO datetime
  upload_id?: string | null; // groups cards created in one batch import; null/absent for manual cards
}

export interface CardCreateBody {
  course_id: string;
  question: string;
  answer: string;
  hint?: string | null;
  distractors?: string[];
  source?: CardSource;
}

export interface CardPatchBody {
  question?: string;
  answer?: string;
  hint?: string | null;
  distractors?: string[];
}

export type CardProfile = {
  id: string;
  course_id: string;
  question: string;
  answer: string;
  distractors: string[];
  hint: string | null;
  source: CardSource;
  sm2_ease: number;
  sm2_interval: number;
  sm2_reps: number;
  next_review_at: string;
  created_at: string;
  upload_id: string | null;
};

export function validateCardCreate(
  body: unknown,
): { ok: true; value: CardCreateBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;

  if (typeof src.course_id !== "string" || src.course_id.trim().length === 0) {
    return { ok: false, error: "course_id is required" };
  }
  if (typeof src.question !== "string" || src.question.trim().length === 0) {
    return { ok: false, error: "question is required" };
  }
  if (typeof src.answer !== "string" || src.answer.trim().length === 0) {
    return { ok: false, error: "answer is required" };
  }

  const source: CardSource =
    src.source === undefined
      ? "manual"
      : CARD_SOURCES.has(src.source as CardSource)
        ? (src.source as CardSource)
        : ("__invalid__" as CardSource);
  if (source === ("__invalid__" as CardSource)) {
    return { ok: false, error: "invalid source" };
  }

  const hint =
    src.hint === undefined || src.hint === null
      ? null
      : typeof src.hint === "string"
        ? src.hint
        : null;

  const distractors =
    Array.isArray(src.distractors) ? (src.distractors as string[]) : [];

  return {
    ok: true,
    value: {
      course_id: src.course_id.trim(),
      question: src.question.trim(),
      answer: src.answer, // keep verbatim — pipe-separated alternatives must not be trimmed
      hint,
      distractors,
      source,
    },
  };
}

export function validateCardPatch(
  body: unknown,
): { ok: true; patch: CardPatchBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: CardPatchBody = {};

  if ("question" in src) {
    if (typeof src.question !== "string" || src.question.trim().length === 0) {
      return { ok: false, error: "question must be a non-empty string" };
    }
    patch.question = src.question.trim();
  }
  if ("answer" in src) {
    if (typeof src.answer !== "string" || src.answer.trim().length === 0) {
      return { ok: false, error: "answer must be a non-empty string" };
    }
    patch.answer = src.answer; // keep verbatim
  }
  if ("hint" in src) {
    patch.hint =
      src.hint === null || src.hint === undefined
        ? null
        : typeof src.hint === "string"
          ? src.hint
          : null;
  }
  if ("distractors" in src) {
    patch.distractors = Array.isArray(src.distractors)
      ? (src.distractors as string[])
      : [];
  }

  return { ok: true, patch };
}

export function cardProfile(row: CardRow): CardProfile {
  return {
    id: row.rowKey,
    course_id: row.course_id,
    question: row.question,
    answer: row.answer,
    distractors: row.distractors,
    hint: row.hint,
    source: row.source,
    sm2_ease: row.sm2_ease,
    sm2_interval: row.sm2_interval,
    sm2_reps: row.sm2_reps,
    next_review_at: row.next_review_at,
    created_at: row.created_at,
    upload_id: row.upload_id ?? null,
  };
}
