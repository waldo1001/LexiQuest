import { describe, it, expect } from "vitest";
import {
  courseProfile,
  deleteCourseAndCascadeCards,
  validateCourseCreate,
  validateCoursePatch,
  type CourseRow,
} from "./courses-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import type { Entity } from "../shared/table-storage.js";

function course(
  userId: string,
  id: string,
  overrides: Partial<CourseRow> = {},
): CourseRow {
  return {
    partitionKey: userId,
    rowKey: id,
    user_id: userId,
    year_id: "y1",
    name: `course-${id}`,
    emoji: "📘",
    color: "#123456",
    language: null,
    default_mode: "ask",
    created_at: "2026-04-22T09:00:00.000Z",
    ...overrides,
  };
}

describe("validateCourseCreate", () => {
  const valid = () => ({
    name: "French",
    emoji: "🇫🇷",
    color: "#ff0000",
    language: "fr-FR",
    default_mode: "ask",
    year_id: "y1",
  });

  it("rejects non-object bodies", () => {
    expect(validateCourseCreate(null).ok).toBe(false);
    expect(validateCourseCreate("nope").ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    for (const field of [
      "name",
      "emoji",
      "color",
      "default_mode",
      "year_id",
    ] as const) {
      const body = { ...valid() } as Record<string, unknown>;
      delete body[field];
      const r = validateCourseCreate(body);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects invalid default_mode", () => {
    const r = validateCourseCreate({ ...valid(), default_mode: "potato" });
    expect(r.ok).toBe(false);
  });

  it("accepts language null and BCP-47 strings", () => {
    for (const lang of [null, "fr-FR", "nl-BE", "en-GB", "de-DE", "en"]) {
      const r = validateCourseCreate({ ...valid(), language: lang });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.language).toBe(lang);
    }
  });

  it("defaults language to null when key is absent", () => {
    const { language: _drop, ...rest } = valid();
    void _drop;
    const r = validateCourseCreate(rest);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.language).toBeNull();
  });

  it("rejects a non-null non-BCP-47 language", () => {
    const r = validateCourseCreate({ ...valid(), language: "gibberish!" });
    expect(r.ok).toBe(false);
  });

  it("accepts question_lang_default and answer_lang_default", () => {
    const r = validateCourseCreate({ ...valid(), question_lang_default: "fr", answer_lang_default: "nl" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.question_lang_default).toBe("fr");
      expect(r.value.answer_lang_default).toBe("nl");
    }
  });

  it("defaults question_lang_default and answer_lang_default to null when absent", () => {
    const r = validateCourseCreate(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.question_lang_default).toBeNull();
      expect(r.value.answer_lang_default).toBeNull();
    }
  });

  it("rejects invalid question_lang_default", () => {
    expect(validateCourseCreate({ ...valid(), question_lang_default: "!!!" }).ok).toBe(false);
  });

  it("rejects invalid answer_lang_default", () => {
    expect(validateCourseCreate({ ...valid(), answer_lang_default: 123 }).ok).toBe(false);
  });

  it("course create accepts bidirectional flag, defaults to false", () => {
    const r1 = validateCourseCreate({ ...valid(), bidirectional: true });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.bidirectional).toBe(true);

    const r2 = validateCourseCreate(valid());
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.bidirectional).toBe(false);
  });
});

describe("validateCoursePatch", () => {
  it("accepts partial mutations of name/emoji/color/language/default_mode", () => {
    const r = validateCoursePatch({
      name: "Spanish",
      emoji: "🇪🇸",
      color: "#00ff00",
      language: "es-ES",
      default_mode: "mcq",
    });
    expect(r.ok).toBe(true);
    const r2 = validateCoursePatch({ language: null });
    expect(r2.ok).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(validateCoursePatch({ name: "" }).ok).toBe(false);
    expect(validateCoursePatch({ default_mode: "nope" }).ok).toBe(false);
    expect(validateCoursePatch({ language: "!!" }).ok).toBe(false);
    expect(validateCoursePatch(null).ok).toBe(false);
  });

  it("accepts question_lang_default and answer_lang_default in patch", () => {
    const r = validateCoursePatch({ question_lang_default: "fr", answer_lang_default: "nl" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.question_lang_default).toBe("fr");
      expect(r.patch.answer_lang_default).toBe("nl");
    }
  });

  it("accepts null to clear per-side defaults", () => {
    const r = validateCoursePatch({ question_lang_default: null, answer_lang_default: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.question_lang_default).toBeNull();
      expect(r.patch.answer_lang_default).toBeNull();
    }
  });

  it("rejects invalid question_lang_default in patch", () => {
    expect(validateCoursePatch({ question_lang_default: "!!!" }).ok).toBe(false);
  });

  it("rejects invalid answer_lang_default in patch", () => {
    expect(validateCoursePatch({ answer_lang_default: 42 }).ok).toBe(false);
  });

  it("course patch can flip bidirectional from false to true and back", () => {
    const r1 = validateCoursePatch({ bidirectional: true });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.patch.bidirectional).toBe(true);

    const r2 = validateCoursePatch({ bidirectional: false });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.patch.bidirectional).toBe(false);
  });

  it("ignores attempts to mutate user_id or year_id", () => {
    const r = validateCoursePatch({
      name: "Renamed",
      user_id: "hacker",
      year_id: "other",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch).toEqual({ name: "Renamed" });
      expect(r.patch).not.toHaveProperty("user_id");
      expect(r.patch).not.toHaveProperty("year_id");
    }
  });
});

describe("courseProfile", () => {
  it("returns a serializable shape", () => {
    const row = course("u1", "c1", { language: "fr-FR" });
    expect(courseProfile(row)).toEqual({
      id: "c1",
      user_id: "u1",
      year_id: "y1",
      name: "course-c1",
      emoji: "📘",
      color: "#123456",
      language: "fr-FR",
      question_lang_default: null,
      answer_lang_default: null,
      default_mode: "ask",
      bidirectional: false,
      created_at: "2026-04-22T09:00:00.000Z",
    });
  });

  it("returns per-side lang defaults when set on the row", () => {
    const row = course("u1", "c1", { question_lang_default: "fr", answer_lang_default: "nl" });
    const p = courseProfile(row);
    expect(p.question_lang_default).toBe("fr");
    expect(p.answer_lang_default).toBe("nl");
  });

  it("defaults missing per-side lang to null for legacy rows", () => {
    const row = course("u1", "c1");
    // legacy rows have no question_lang_default / answer_lang_default properties
    const p = courseProfile(row);
    expect(p.question_lang_default).toBeNull();
    expect(p.answer_lang_default).toBeNull();
  });

  it("exposes bidirectional, defaulting to false for legacy rows", () => {
    const row = course("u1", "c1");
    expect(courseProfile(row).bidirectional).toBe(false);
  });

  it("preserves bidirectional=true when set", () => {
    const row = course("u1", "c1", { bidirectional: true });
    expect(courseProfile(row).bidirectional).toBe(true);
  });
});

describe("deleteCourseAndCascadeCards", () => {
  it("removes every card in the course partition, then the course row", async () => {
    const tables = new FakeTableStorage();
    await tables.upsert<CourseRow>("courses", course("u1", "c1"));
    await tables.upsert<Entity>("cards", {
      partitionKey: "c1",
      rowKey: "card-a",
    });
    await tables.upsert<Entity>("cards", {
      partitionKey: "c1",
      rowKey: "card-b",
    });
    await tables.upsert<Entity>("cards", {
      partitionKey: "other-course",
      rowKey: "card-z",
    });

    await deleteCourseAndCascadeCards(tables, "u1", "c1");

    expect(
      await tables.getById<CourseRow>("courses", "u1", "c1"),
    ).toBeNull();
    expect(await tables.listByPartition<Entity>("cards", "c1")).toEqual([]);
    expect(
      await tables.listByPartition<Entity>("cards", "other-course"),
    ).toHaveLength(1);
  });

  it("is a no-op when the course does not exist", async () => {
    const tables = new FakeTableStorage();
    await expect(
      deleteCourseAndCascadeCards(tables, "u1", "missing"),
    ).resolves.toBeUndefined();
  });
});
