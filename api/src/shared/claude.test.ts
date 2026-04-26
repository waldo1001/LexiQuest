import { describe, it, expect } from "vitest";
import { stripFences, parseCards, ClaudeJsonParseError } from "./claude.js";

describe("stripFences", () => {
  it("removes ```json ... ``` wrapper (AC1)", () => {
    const raw = "```json\n[{\"question\":\"Q\",\"answer\":\"A\",\"distractors\":[\"X\",\"Y\"]}]\n```";
    expect(stripFences(raw)).toBe('[{"question":"Q","answer":"A","distractors":["X","Y"]}]');
  });

  it("removes ``` ... ``` without language tag (AC1)", () => {
    const raw = "```\n[]\n```";
    expect(stripFences(raw)).toBe("[]");
  });

  it("is a no-op when no fences (AC2)", () => {
    const raw = '[{"question":"Q","answer":"A","distractors":["X","Y"]}]';
    expect(stripFences(raw)).toBe(raw);
  });

  it("trims surrounding whitespace (AC2)", () => {
    expect(stripFences("  []\n  ")).toBe("[]");
  });
});

describe("parseCards", () => {
  it("returns CardCandidate[] on valid JSON array (AC3)", () => {
    const raw = '[{"question":"What is a dog?","answer":"le chien","distractors":["le chat","le cheval"]}]';
    const result = parseCards(raw);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("What is a dog?");
    expect(result[0].distractors).toEqual(["le chat", "le cheval"]);
  });

  it("handles JSON wrapped in fences (AC3)", () => {
    const raw = "```json\n[{\"question\":\"Q\",\"answer\":\"A\",\"distractors\":[\"X\",\"Y\"]}]\n```";
    expect(parseCards(raw)).toHaveLength(1);
  });

  it("throws ClaudeJsonParseError on invalid JSON (AC4)", () => {
    expect(() => parseCards("not json")).toThrow(ClaudeJsonParseError);
    expect(() => parseCards("not json")).toThrow("not valid JSON");
  });

  it("includes raw text in ClaudeJsonParseError (AC4)", () => {
    try {
      parseCards("bad");
    } catch (e) {
      expect(e).toBeInstanceOf(ClaudeJsonParseError);
      expect((e as ClaudeJsonParseError).raw).toBe("bad");
    }
  });

  it("throws ClaudeJsonParseError when result is not an array (AC5)", () => {
    expect(() => parseCards('{"question":"Q"}')).toThrow(ClaudeJsonParseError);
    expect(() => parseCards('{"question":"Q"}')).toThrow("Expected a JSON array");
  });

  it("returns empty array for empty JSON array (AC3)", () => {
    expect(parseCards("[]")).toEqual([]);
  });

  it("surfaces question_lang and answer_lang from Claude JSON (AC-lang1)", () => {
    const raw = JSON.stringify([
      { question: "the dog", answer: "le chien", distractors: ["le chat", "le cheval"], question_lang: "en", answer_lang: "fr-FR" },
    ]);
    const result = parseCards(raw);
    expect(result[0].question_lang).toBe("en");
    expect(result[0].answer_lang).toBe("fr-FR");
  });

  it("defaults missing question_lang and answer_lang to null (AC-lang2)", () => {
    const raw = '[{"question":"Q","answer":"A","distractors":["X","Y"]}]';
    const result = parseCards(raw);
    expect(result[0].question_lang).toBeNull();
    expect(result[0].answer_lang).toBeNull();
  });
});
