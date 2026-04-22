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
      default_mode: "ask",
      created_at: "2026-04-22T09:00:00.000Z",
    });
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
