import { describe, it, expect } from "vitest";
import {
  validateCardCreate,
  validateCardPatch,
  cardProfile,
  buildReverseCard,
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

describe("validateCardCreate — per-side language", () => {
  it("accepts valid BCP-47 question_lang and answer_lang", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "the dog",
      answer: "le chien",
      question_lang: "en",
      answer_lang: "fr-FR",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.question_lang).toBe("en");
      expect(result.value.answer_lang).toBe("fr-FR");
    }
  });

  it("accepts null question_lang and answer_lang", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
      question_lang: null,
      answer_lang: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.question_lang).toBeNull();
      expect(result.value.answer_lang).toBeNull();
    }
  });

  it("defaults omitted question_lang and answer_lang to null", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.question_lang).toBeNull();
      expect(result.value.answer_lang).toBeNull();
    }
  });

  it("rejects invalid question_lang", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
      question_lang: "french",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/question_lang/);
  });

  it("rejects invalid answer_lang", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
      answer_lang: "FR",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/answer_lang/);
  });

  it("rejects numeric question_lang", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
      question_lang: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/question_lang/);
  });

  it("accepts three-letter BCP-47 codes", () => {
    const result = validateCardCreate({
      course_id: "c1",
      question: "Q",
      answer: "A",
      question_lang: "nld",
      answer_lang: "fra",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.question_lang).toBe("nld");
      expect(result.value.answer_lang).toBe("fra");
    }
  });
});

describe("validateCardPatch — per-side language", () => {
  it("accepts valid BCP-47 question_lang and answer_lang in patch", () => {
    const result = validateCardPatch({ question_lang: "en", answer_lang: "fr-FR" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.question_lang).toBe("en");
      expect(result.patch.answer_lang).toBe("fr-FR");
    }
  });

  it("accepts null question_lang in patch (clear)", () => {
    const result = validateCardPatch({ question_lang: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.question_lang).toBeNull();
  });

  it("rejects invalid answer_lang in patch", () => {
    const result = validateCardPatch({ answer_lang: "french" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/answer_lang/);
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

  it("coerces missing upload_id to null (legacy rows)", () => {
    const row = makeRow();
    expect(cardProfile(row).upload_id).toBeNull();
  });

  it("preserves a string upload_id", () => {
    const row = makeRow({ upload_id: "upload-abc" });
    expect(cardProfile(row).upload_id).toBe("upload-abc");
  });

  it("coerces explicit null upload_id to null", () => {
    const row = makeRow({ upload_id: null });
    expect(cardProfile(row).upload_id).toBeNull();
  });

  it("exposes question_lang and answer_lang, defaulting to null for legacy rows (AC4)", () => {
    const row = makeRow(); // no question_lang/answer_lang
    const profile = cardProfile(row);
    expect(profile.question_lang).toBeNull();
    expect(profile.answer_lang).toBeNull();
  });

  it("preserves string question_lang and answer_lang", () => {
    const row = makeRow({ question_lang: "en", answer_lang: "fr-FR" });
    const profile = cardProfile(row);
    expect(profile.question_lang).toBe("en");
    expect(profile.answer_lang).toBe("fr-FR");
  });

  it("exposes reverse_of, defaulting to null for legacy rows", () => {
    const row = makeRow(); // no reverse_of
    expect(cardProfile(row).reverse_of).toBeNull();
  });

  it("preserves string reverse_of", () => {
    const row = makeRow({ reverse_of: "card-99" });
    expect(cardProfile(row).reverse_of).toBe("card-99");
  });
});

describe("buildReverseCard", () => {
  const NOW_ISO = "2026-04-25T10:00:00.000Z";

  it("swaps question and answer with fresh SM-2", () => {
    const forward = makeRow({
      question: "the dog",
      answer: "le chien",
      sm2_ease: 3.0,
      sm2_interval: 10,
      sm2_reps: 5,
    });
    const rev = buildReverseCard(forward, { id: "rev-1", nowIso: NOW_ISO });
    expect(rev.question).toBe("le chien");
    expect(rev.answer).toBe("the dog");
    expect(rev.sm2_ease).toBe(2.5);
    expect(rev.sm2_interval).toBe(0);
    expect(rev.sm2_reps).toBe(0);
    expect(rev.next_review_at).toBe(NOW_ISO);
    expect(rev.created_at).toBe(NOW_ISO);
  });

  it("splits pipe-alternatives and uses the first as the new question", () => {
    const forward = makeRow({
      question: "the dog",
      answer: "le chien|le chiot",
    });
    const rev = buildReverseCard(forward, { id: "rev-2", nowIso: NOW_ISO });
    expect(rev.question).toBe("le chien");
    expect(rev.answer).toBe("the dog");
  });

  it("sets source='reverse' and reverse_of=forward.rowKey", () => {
    const forward = makeRow({ rowKey: "fwd-42" });
    const rev = buildReverseCard(forward, { id: "rev-3", nowIso: NOW_ISO });
    expect(rev.source).toBe("reverse");
    expect(rev.reverse_of).toBe("fwd-42");
  });

  it("nulls hint and distractors", () => {
    const forward = makeRow({
      hint: "Think of a pet",
      distractors: ["le chat", "le poisson"],
    });
    const rev = buildReverseCard(forward, { id: "rev-4", nowIso: NOW_ISO });
    expect(rev.hint).toBeNull();
    expect(rev.distractors).toEqual([]);
  });

  it("preserves course_id, partitionKey, and per-side languages (swapped)", () => {
    const forward = makeRow({
      partitionKey: "course-7",
      course_id: "course-7",
      question_lang: "en",
      answer_lang: "fr",
    });
    const rev = buildReverseCard(forward, { id: "rev-5", nowIso: NOW_ISO });
    expect(rev.partitionKey).toBe("course-7");
    expect(rev.course_id).toBe("course-7");
    expect(rev.question_lang).toBe("fr");
    expect(rev.answer_lang).toBe("en");
  });

  it("uses the provided id as rowKey", () => {
    const forward = makeRow();
    const rev = buildReverseCard(forward, { id: "custom-id", nowIso: NOW_ISO });
    expect(rev.rowKey).toBe("custom-id");
  });
});
