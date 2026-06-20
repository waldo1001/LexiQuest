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

describe("validateSessionCreate — gameType and cardLimit", () => {
  it("accepts body with gameType and cardLimit", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", gameType: "boss_round", cardLimit: 20 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.gameType).toBe("boss_round");
      expect(r.value.cardLimit).toBe(20);
    }
  });

  it("defaults missing gameType to classic", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.gameType).toBe("classic");
  });

  it("defaults missing cardLimit to null", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cardLimit).toBeNull();
  });

  it("rejects invalid gameType", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", gameType: "bad" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/gameType/);
  });

  it("rejects negative cardLimit", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", cardLimit: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cardLimit/);
  });

  it("rejects zero cardLimit", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", cardLimit: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cardLimit/);
  });

  it("accepts all valid game types", () => {
    for (const gt of ["classic", "boss_round", "speed_round", "review_blitz"] as const) {
      const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", gameType: gt });
      expect(r.ok).toBe(true);
    }
  });
});

describe("validateSessionCreate — cardOrder", () => {
  it("accepts cardOrder 'sequential'", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", cardOrder: "sequential" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cardOrder).toBe("sequential");
  });

  it("accepts cardOrder 'hardest_first'", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", cardOrder: "hardest_first" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cardOrder).toBe("hardest_first");
  });

  it("defaults cardOrder to 'hardest_first' when omitted", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cardOrder).toBe("hardest_first");
  });

  it("rejects an unknown cardOrder", () => {
    const r = validateSessionCreate({ courseId: "c1", mode: "self_grade", cardOrder: "shuffled" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cardOrder/);
  });
});

describe("sessionProfile", () => {
  const row: SessionRow = {
    partitionKey: "u-lex",
    rowKey: "2026-04-22T10:00:00.000Z_sess-1",
    user_id: "u-lex",
    course_id: "c1",
    mode: "self_grade",
    game_type: "boss_round",
    card_limit: 15,
    started_at: "2026-04-22T10:00:00.000Z",
    ended_at: null,
    cards_studied: 5,
    cards_correct: 3,
    xp_earned: 0,
    duration_seconds: 120,
  };

  it("maps row to profile including game_type and card_limit", () => {
    const p = sessionProfile({ ...row, card_order: "sequential" } as SessionRow);
    expect(p.id).toBe("sess-1");
    expect(p.user_id).toBe("u-lex");
    expect(p.course_id).toBe("c1");
    expect(p.mode).toBe("self_grade");
    expect(p.game_type).toBe("boss_round");
    expect(p.card_limit).toBe(15);
    expect(p.card_order).toBe("sequential");
    expect(p.ended_at).toBeNull();
    expect(p.cards_studied).toBe(5);
    expect(p.cards_correct).toBe(3);
    expect(p.xp_earned).toBe(0);
    expect(p.duration_seconds).toBe(120);
  });

  it("defaults missing game_type to classic and card_limit to null", () => {
    const legacyRow: SessionRow = {
      partitionKey: "u-lex",
      rowKey: "2026-04-22T10:00:00.000Z_sess-2",
      user_id: "u-lex",
      course_id: "c1",
      mode: "self_grade",
      started_at: "2026-04-22T10:00:00.000Z",
      ended_at: null,
      cards_studied: 0,
      cards_correct: 0,
      xp_earned: 0,
      duration_seconds: 0,
    } as SessionRow;
    const p = sessionProfile(legacyRow);
    expect(p.game_type).toBe("classic");
    expect(p.card_limit).toBeNull();
    expect(p.card_order).toBe("random");
  });
});
