import { describe, it, expect } from "vitest";
import {
  validateCardCreate,
  validateCardPatch,
  cardProfile,
  type CardRow,
} from "./cards-shared.js";

function makeRow(overrides: Partial<CardRow> = {}): CardRow {
  return {
    partitionKey: "course-1",
    rowKey: "card-1",
    course_id: "course-1",
    question: "What is the capital of France?",
    answer: "Paris",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00.000Z",
    created_at: "2026-04-22T09:00:00.000Z",
    ...overrides,
  };
}

describe("validateCardCreate", () => {
  it("accepts valid create body", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "What is 2+2?",
      answer: "4",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.course_id).toBe("c1");
      expect(result.value.question).toBe("What is 2+2?");
      expect(result.value.answer).toBe("4");
      expect(result.value.source).toBe("manual");
    }
  });

  it("accepts pipe-separated answer verbatim", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "What is a dog?",
      answer: "le chien|le chiot",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.answer).toBe("le chien|le chiot");
    }
  });

  it("rejects body with missing question", () => {
    const result = validateCardCreate({ course_id: "c1", answer: "Paris" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/question/);
  });

  it("rejects body with missing answer", () => {
    const result = validateCardCreate({ course_id: "c1", question: "Q?" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/answer/);
  });

  it("rejects body with missing course_id", () => {
    const result = validateCardCreate({ question: "Q?", answer: "A" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/course_id/);
  });

  it("rejects unknown source enum", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q?",
      answer: "A",
      source: "robot",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/source/);
  });

  it("defaults source to manual when omitted", () => {
    const result = validateCardCreate({ course_id: "c1", question: "Q?", answer: "A" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.source).toBe("manual");
  });

  it("rejects non-object body", () => {
    expect(validateCardCreate(null).ok).toBe(false);
    expect(validateCardCreate("string").ok).toBe(false);
  });
});

describe("validateCardPatch", () => {
  it("accepts empty patch (no fields required)", () => {
    const result = validateCardPatch({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch).toEqual({});
  });

  it("accepts partial patch with question only", () => {
    const result = validateCardPatch({ question: "New question?" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.question).toBe("New question?");
  });

  it("rejects empty string question", () => {
    const result = validateCardPatch({ question: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects empty string answer", () => {
    const result = validateCardPatch({ answer: "" });
    expect(result.ok).toBe(false);
  });

  it("accepts pipe-separated answer in patch", () => {
    const result = validateCardPatch({ answer: "le chien|le chiot" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.answer).toBe("le chien|le chiot");
  });

  it("rejects non-object body", () => {
    expect(validateCardPatch(null).ok).toBe(false);
  });

  it("accepts hint as a string", () => {
    const result = validateCardPatch({ hint: "Try thinking of dogs" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.hint).toBe("Try thinking of dogs");
  });

  it("accepts null hint (clear hint)", () => {
    const result = validateCardPatch({ hint: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.hint).toBeNull();
  });

  it("coerces non-string hint to null", () => {
    const result = validateCardPatch({ hint: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.hint).toBeNull();
  });

  it("accepts distractors array", () => {
    const result = validateCardPatch({ distractors: ["a", "b"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.distractors).toEqual(["a", "b"]);
  });

  it("coerces non-array distractors to empty array", () => {
    const result = validateCardPatch({ distractors: "invalid" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.distractors).toEqual([]);
  });
});

describe("validateCardCreate — edge cases", () => {
  it("coerces non-string hint to null", () => {
    const result = validateCardCreate({ course_id: "c1", question: "Q?", answer: "A", hint: 99 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.hint).toBeNull();
  });

  it("accepts non-array distractors as empty array", () => {
    const result = validateCardCreate({ course_id: "c1", question: "Q?", answer: "A", distractors: "bad" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.distractors).toEqual([]);
  });

  it("accepts known source values: photo and ai_import", () => {
    const photo = validateCardCreate({ course_id: "c1", question: "Q?", answer: "A", source: "photo" });
    expect(photo.ok).toBe(true);
    const ai = validateCardCreate({ course_id: "c1", question: "Q?", answer: "A", source: "ai_import" });
    expect(ai.ok).toBe(true);
  });
});

describe("cardProfile", () => {
  it("maps row fields correctly to response DTO", () => {
    const row = makeRow({ hint: "Think France" });
    const profile = cardProfile(row);
    expect(profile.id).toBe("card-1");
    expect(profile.course_id).toBe("course-1");
    expect(profile.question).toBe("What is the capital of France?");
    expect(profile.answer).toBe("Paris");
    expect(profile.distractors).toEqual([]);
    expect(profile.hint).toBe("Think France");
    expect(profile.source).toBe("manual");
    expect(profile.sm2_ease).toBe(2.5);
    expect(profile.sm2_interval).toBe(0);
    expect(profile.sm2_reps).toBe(0);
    expect(profile.next_review_at).toBe("2026-04-22T09:00:00.000Z");
    expect(profile.created_at).toBe("2026-04-22T09:00:00.000Z");
  });
});
