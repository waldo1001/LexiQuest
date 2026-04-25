import type { Entity } from "../shared/table-storage.js";

export type CardSource = "manual" | "photo" | "ai_import" | "reverse";

const CARD_SOURCES = new Set<CardSource>(["manual", "photo", "ai_import", "reverse"]);

/** BCP-47 shape check — reused from courses-shared.ts */
const BCP47_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

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
  question_lang?: string | null; // BCP-47 language code for the question side; null = use course language
  answer_lang?: string | null;   // BCP-47 language code for the answer side; null = use course language
  reverse_of?: string | null;    // rowKey of the forward card this was generated from; null = not a reverse
}

export interface CardCreateBody {
  course_id: string;
  question: string;
  answer: string;
  hint?: string | null;
  distractors?: string[];
  source?: CardSource;
  question_lang?: string | null;
  answer_lang?: string | null;
}

export interface CardPatchBody {
  question?: string;
  answer?: string;
  hint?: string | null;
  distractors?: string[];
  question_lang?: string | null;
  answer_lang?: string | null;
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
  question_lang: string | null;
  answer_lang: string | null;
  reverse_of: string | null;
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

  const question_lang = src.question_lang === undefined || src.question_lang === null
    ? null
    : typeof src.question_lang === "string" && BCP47_RE.test(src.question_lang)
      ? src.question_lang
      : "__invalid__";
  if (question_lang === "__invalid__") {
    return { ok: false, error: "question_lang must be a valid BCP-47 code (e.g. en, fr-FR)" };
  }

  const answer_lang = src.answer_lang === undefined || src.answer_lang === null
    ? null
    : typeof src.answer_lang === "string" && BCP47_RE.test(src.answer_lang)
      ? src.answer_lang
      : "__invalid__";
  if (answer_lang === "__invalid__") {
    return { ok: false, error: "answer_lang must be a valid BCP-47 code (e.g. en, fr-FR)" };
  }

  return {
    ok: true,
    value: {
      course_id: src.course_id.trim(),
      question: src.question.trim(),
      answer: src.answer, // keep verbatim — pipe-separated alternatives must not be trimmed
      hint,
      distractors,
      source,
      question_lang,
      answer_lang,
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
  if ("question_lang" in src) {
    if (src.question_lang === null || src.question_lang === undefined) {
      patch.question_lang = null;
    } else if (typeof src.question_lang === "string" && BCP47_RE.test(src.question_lang)) {
      patch.question_lang = src.question_lang;
    } else {
      return { ok: false, error: "question_lang must be a valid BCP-47 code (e.g. en, fr-FR)" };
    }
  }
  if ("answer_lang" in src) {
    if (src.answer_lang === null || src.answer_lang === undefined) {
      patch.answer_lang = null;
    } else if (typeof src.answer_lang === "string" && BCP47_RE.test(src.answer_lang)) {
      patch.answer_lang = src.answer_lang;
    } else {
      return { ok: false, error: "answer_lang must be a valid BCP-47 code (e.g. en, fr-FR)" };
    }
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
    question_lang: row.question_lang ?? null,
    answer_lang: row.answer_lang ?? null,
    reverse_of: row.reverse_of ?? null,
  };
}

export function buildReverseCard(
  forward: CardRow,
  opts: { id: string; nowIso: string },
): CardRow {
  const answer = forward.answer;
  const question = answer.includes("|") ? answer.split("|")[0] : answer;
  return {
    partitionKey: forward.partitionKey,
    rowKey: opts.id,
    course_id: forward.course_id,
    question,
    answer: forward.question,
    distractors: [],
    hint: null,
    source: "reverse",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: opts.nowIso,
    created_at: opts.nowIso,
    upload_id: forward.upload_id ?? null,
    question_lang: forward.answer_lang ?? null,
    answer_lang: forward.question_lang ?? null,
    reverse_of: forward.rowKey,
  };
}
