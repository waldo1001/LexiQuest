import type { Entity, TableStorage } from "../shared/table-storage.js";

export type CourseDefaultMode = "self_grade" | "mcq" | "mixed" | "ask";

export const COURSE_DEFAULT_MODES = new Set<CourseDefaultMode>([
  "self_grade",
  "mcq",
  "mixed",
  "ask",
]);

/**
 * BCP-47 shape check — two or three lowercase letters optionally
 * followed by `-` and two uppercase letters. Open-ended by design
 * (Design.md §3.2 leaves the list extensible), so the shape is a
 * lightweight structural guard rather than a hard allowlist.
 */
const BCP47_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export interface CourseRow extends Entity {
  partitionKey: string; // = user_id
  rowKey: string; // = course id
  user_id: string;
  year_id: string;
  name: string;
  emoji: string;
  color: string;
  language: string | null;
  question_lang_default?: string | null;
  answer_lang_default?: string | null;
  default_mode: CourseDefaultMode;
  bidirectional?: boolean;
  created_at: string;
}

export interface CourseCreateBody {
  name: string;
  emoji: string;
  color: string;
  language: string | null;
  question_lang_default: string | null;
  answer_lang_default: string | null;
  default_mode: CourseDefaultMode;
  bidirectional: boolean;
  year_id: string;
}

export function validateCourseCreate(
  body: unknown,
): { ok: true; value: CourseCreateBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.name !== "string" || src.name.trim().length === 0) {
    return { ok: false, error: "name is required" };
  }
  if (typeof src.emoji !== "string" || src.emoji.length === 0) {
    return { ok: false, error: "emoji is required" };
  }
  if (typeof src.color !== "string" || src.color.length === 0) {
    return { ok: false, error: "color is required" };
  }
  if (typeof src.year_id !== "string" || src.year_id.length === 0) {
    return { ok: false, error: "year_id is required" };
  }
  if (
    typeof src.default_mode !== "string" ||
    !COURSE_DEFAULT_MODES.has(src.default_mode as CourseDefaultMode)
  ) {
    return { ok: false, error: "invalid default_mode" };
  }
  const language = normalizeLanguage(src.language);
  if (language === INVALID) {
    return { ok: false, error: "invalid language" };
  }
  const question_lang_default = normalizeLanguage(src.question_lang_default);
  if (question_lang_default === INVALID) {
    return { ok: false, error: "invalid question_lang_default" };
  }
  const answer_lang_default = normalizeLanguage(src.answer_lang_default);
  if (answer_lang_default === INVALID) {
    return { ok: false, error: "invalid answer_lang_default" };
  }
  const bidirectional = src.bidirectional === true;
  return {
    ok: true,
    value: {
      name: src.name.trim(),
      emoji: src.emoji,
      color: src.color,
      language,
      question_lang_default,
      answer_lang_default,
      default_mode: src.default_mode as CourseDefaultMode,
      bidirectional,
      year_id: src.year_id,
    },
  };
}

export interface CoursePatchBody {
  name?: string;
  emoji?: string;
  color?: string;
  language?: string | null;
  question_lang_default?: string | null;
  answer_lang_default?: string | null;
  default_mode?: CourseDefaultMode;
  bidirectional?: boolean;
}

export function validateCoursePatch(
  body: unknown,
): { ok: true; patch: CoursePatchBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: CoursePatchBody = {};
  if ("name" in src) {
    if (typeof src.name !== "string" || src.name.trim().length === 0) {
      return { ok: false, error: "name must be a non-empty string" };
    }
    patch.name = src.name.trim();
  }
  if ("emoji" in src) {
    if (typeof src.emoji !== "string" || src.emoji.length === 0) {
      return { ok: false, error: "emoji must be a non-empty string" };
    }
    patch.emoji = src.emoji;
  }
  if ("color" in src) {
    if (typeof src.color !== "string" || src.color.length === 0) {
      return { ok: false, error: "color must be a non-empty string" };
    }
    patch.color = src.color;
  }
  if ("default_mode" in src) {
    if (
      typeof src.default_mode !== "string" ||
      !COURSE_DEFAULT_MODES.has(src.default_mode as CourseDefaultMode)
    ) {
      return { ok: false, error: "invalid default_mode" };
    }
    patch.default_mode = src.default_mode as CourseDefaultMode;
  }
  if ("bidirectional" in src) {
    patch.bidirectional = src.bidirectional === true;
  }
  if ("language" in src) {
    const language = normalizeLanguage(src.language);
    if (language === INVALID) {
      return { ok: false, error: "invalid language" };
    }
    patch.language = language;
  }
  if ("question_lang_default" in src) {
    const v = normalizeLanguage(src.question_lang_default);
    if (v === INVALID) {
      return { ok: false, error: "invalid question_lang_default" };
    }
    patch.question_lang_default = v;
  }
  if ("answer_lang_default" in src) {
    const v = normalizeLanguage(src.answer_lang_default);
    if (v === INVALID) {
      return { ok: false, error: "invalid answer_lang_default" };
    }
    patch.answer_lang_default = v;
  }
  return { ok: true, patch };
}

export function courseProfile(row: CourseRow): {
  id: string;
  user_id: string;
  year_id: string;
  name: string;
  emoji: string;
  color: string;
  language: string | null;
  question_lang_default: string | null;
  answer_lang_default: string | null;
  default_mode: CourseDefaultMode;
  bidirectional: boolean;
  created_at: string;
} {
  return {
    id: row.rowKey,
    user_id: row.user_id,
    year_id: row.year_id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    language: row.language,
    question_lang_default: row.question_lang_default ?? null,
    answer_lang_default: row.answer_lang_default ?? null,
    default_mode: row.default_mode,
    bidirectional: row.bidirectional ?? false,
    created_at: row.created_at,
  };
}

/**
 * Delete a course row and every card in its partition. Idempotent —
 * safe to call for an id that is already gone.
 */
export async function deleteCourseAndCascadeCards(
  tables: TableStorage,
  userId: string,
  courseId: string,
): Promise<void> {
  const cards = await tables.listByPartition<Entity>("cards", courseId);
  for (const card of cards) {
    await tables.remove("cards", card.partitionKey, card.rowKey);
  }
  await tables.remove("courses", userId, courseId);
}

const INVALID = Symbol("invalid-language");

function normalizeLanguage(raw: unknown): string | null | typeof INVALID {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return INVALID;
  if (!BCP47_RE.test(raw)) return INVALID;
  return raw;
}
