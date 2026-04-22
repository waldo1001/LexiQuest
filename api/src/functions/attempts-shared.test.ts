import { describe, it, expect } from "vitest";
import {
  validateAttemptsBody,
  makeAttemptRowKey,
} from "./attempts-shared.js";

describe("validateAttemptsBody", () => {
  const validItem = () => ({
    cardId: "card-1",
    correct: true,
    mode: "self_grade",
    response_time_ms: 1000,
  });

  it("accepts valid body", () => {
    const r = validateAttemptsBody({ sessionId: "sess-1", items: [validItem()] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sessionId).toBe("sess-1");
      expect(r.value.items).toHaveLength(1);
    }
  });

  it("accepts mode=mcq", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), mode: "mcq" }] });
    expect(r.ok).toBe(true);
  });

  it("rejects non-object body", () => {
    expect(validateAttemptsBody(null).ok).toBe(false);
    expect(validateAttemptsBody("str").ok).toBe(false);
    expect(validateAttemptsBody(42).ok).toBe(false);
  });

  it("rejects missing sessionId", () => {
    const r = validateAttemptsBody({ items: [validItem()] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sessionId/);
  });

  it("rejects empty sessionId", () => {
    const r = validateAttemptsBody({ sessionId: "  ", items: [validItem()] });
    expect(r.ok).toBe(false);
  });

  it("rejects non-array items", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: "bad" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/items/);
  });

  it("rejects empty items array", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects missing cardId in item", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), cardId: undefined }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cardId/);
  });

  it("rejects empty cardId in item", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), cardId: "  " }] });
    expect(r.ok).toBe(false);
  });

  it("rejects non-boolean correct", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), correct: "yes" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/correct/);
  });

  it("rejects invalid mode", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), mode: "bad" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mode/);
  });

  it("rejects negative response_time_ms", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), response_time_ms: -1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/response_time_ms/);
  });

  it("rejects non-number response_time_ms", () => {
    const r = validateAttemptsBody({ sessionId: "s", items: [{ ...validItem(), response_time_ms: "fast" }] });
    expect(r.ok).toBe(false);
  });

  it("trims sessionId and cardId", () => {
    const r = validateAttemptsBody({ sessionId: "  s1  ", items: [{ ...validItem(), cardId: "  c1  " }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sessionId).toBe("s1");
      expect(r.value.items[0]?.cardId).toBe("c1");
    }
  });
});

describe("makeAttemptRowKey", () => {
  it("produces timestamp_id format", () => {
    expect(makeAttemptRowKey("2026-04-22T10:00:00.000Z", "att-1")).toBe(
      "2026-04-22T10:00:00.000Z_att-1",
    );
  });
});
