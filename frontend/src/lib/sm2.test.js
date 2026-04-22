import { describe, it, expect } from "vitest";
import { applySm2 } from "./sm2.js";

const NOW = new Date("2026-04-22T10:00:00.000Z");
const DAY_MS = 86_400_000;
function daysLater(n) {
  return new Date(NOW.getTime() + n * DAY_MS).toISOString();
}

const BASE = { sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0 };

describe("applySm2 — frontend mirror (JavaScript)", () => {
  it("wrong answer → reps=0, interval=1", () => {
    const r = applySm2({ ...BASE, sm2_reps: 2, sm2_interval: 6 }, 0, NOW);
    expect(r.reps).toBe(0);
    expect(r.interval).toBe(1);
    expect(r.next_review_at).toBe(daysLater(1));
  });

  it("correct first time → reps=1, interval=1, ease+0.1", () => {
    const r = applySm2(BASE, 5, NOW);
    expect(r.reps).toBe(1);
    expect(r.interval).toBe(1);
    expect(r.ease).toBeCloseTo(2.6, 5);
  });

  it("correct second time → reps=2, interval=6", () => {
    const r = applySm2({ ...BASE, sm2_reps: 1, sm2_interval: 1 }, 5, NOW);
    expect(r.reps).toBe(2);
    expect(r.interval).toBe(6);
  });

  it("mature card → interval = round(prev * ease)", () => {
    const r = applySm2({ sm2_ease: 2.5, sm2_interval: 6, sm2_reps: 2 }, 5, NOW);
    expect(r.interval).toBe(Math.round(6 * 2.5));
    expect(r.reps).toBe(3);
  });

  it("ease never drops below 1.3", () => {
    const r = applySm2({ ...BASE, sm2_ease: 1.3 }, 0, NOW);
    expect(r.ease).toBeGreaterThanOrEqual(1.3);
  });
});
