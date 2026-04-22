import { describe, it, expect } from "vitest";
import {
  validateSessionCreate,
  sessionProfile,
  makeSessionRowKey,
  rowKeyToId,
  type SessionRow,
} from "./sessions-shared.js";

describe("validateSessionCreate", () => {
  it("accepts valid body", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.courseId).toBe("c1");
      expect(r.value.mode).toBe("self_grade");
    }
  });

  it("accepts all valid modes", () => {
    for (const mode of ["self_grade", "mcq", "mixed", "ask"] as const) {
      const r = validateSessionCreate({ courseId: "c1", mode });
      expect(r.ok).toBe(true);
    }
  });

  it("rejects non-object body", () => {
    expect(validateSessionCreate(null).ok).toBe(false);
    expect(validateSessionCreate("string").ok).toBe(false);
  });

  it("rejects missing courseId", () => {
    const r = validateSessionCreate({ mode: "self_grade" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/courseId/);
  });

  it("rejects empty courseId", () => {
    const r = validateSessionCreate({ courseId: "  ", mode: "self_grade" });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid mode", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "bad" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mode/);
  });

  it("trims courseId whitespace", () => {
    const r = validateSessionCreate({ courseId: "  c1  ", mode: "self_grade" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.courseId).toBe("c1");
  });
});

describe("makeSessionRowKey / rowKeyToId", () => {
  it("makeSessionRowKey produces iso_id format", () => {
    const rk = makeSessionRowKey("2026-04-22T10:00:00.000Z", "abc-123");
    expect(rk).toBe("2026-04-22T10:00:00.000Z_abc-123");
  });

  it("rowKeyToId extracts the id part", () => {
    expect(rowKeyToId("2026-04-22T10:00:00.000Z_abc-123")).toBe("abc-123");
  });

  it("rowKeyToId with no underscore returns the whole key", () => {
    expect(rowKeyToId("noUnderscore")).toBe("noUnderscore");
  });
});

describe("sessionProfile", () => {
  const row: SessionRow = {
    partitionKey: "u-lex",
    rowKey: "2026-04-22T10:00:00.000Z_sess-1",
    user_id: "u-lex",
    course_id: "c1",
    mode: "self_grade",
    started_at: "2026-04-22T10:00:00.000Z",
    ended_at: null,
    cards_studied: 5,
    cards_correct: 3,
    xp_earned: 0,
    duration_seconds: 120,
  };

  it("maps row to profile, extracting id from rowKey", () => {
    const p = sessionProfile(row);
    expect(p.id).toBe("sess-1");
    expect(p.user_id).toBe("u-lex");
    expect(p.course_id).toBe("c1");
    expect(p.mode).toBe("self_grade");
    expect(p.ended_at).toBeNull();
    expect(p.cards_studied).toBe(5);
    expect(p.cards_correct).toBe(3);
    expect(p.xp_earned).toBe(0);
    expect(p.duration_seconds).toBe(120);
  });
});
