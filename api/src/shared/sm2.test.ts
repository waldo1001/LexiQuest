import { describe, it, expect } from "vitest";
import { applySm2 } from "./sm2.js";

const NOW = new Date("2026-04-22T10:00:00.000Z");
const DAY_MS = 86_400_000;

function daysLater(n: number): string {
  return new Date(NOW.getTime() + n * DAY_MS).toISOString();
}

const BASE = { sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0 };

describe("applySm2 — wrong answer (quality=0)", () => {
  it("resets reps to 0 and sets interval=1", () => {
    const r = applySm2({ ...BASE, sm2_reps: 2, sm2_interval: 6 }, 0, NOW);
    expect(r.reps).toBe(0);
    expect(r.interval).toBe(1);
  });

  it("schedules next_review_at for tomorrow", () => {
    const r = applySm2(BASE, 0, NOW);
    expect(r.next_review_at).toBe(daysLater(1));
  });

  it("adjusts ease down, never below 1.3", () => {
    const r = applySm2({ ...BASE, sm2_ease: 1.4 }, 0, NOW);
    expect(r.ease).toBeCloseTo(1.3, 5);
  });

  it("ease with quality=2 (boundary just below 3) — fail path", () => {
    const r = applySm2(BASE, 2, NOW);
    expect(r.reps).toBe(0);
    expect(r.interval).toBe(1);
  });
});

describe("applySm2 — correct first time (reps=0, quality=5)", () => {
  it("sets reps=1, interval=1", () => {
    const r = applySm2(BASE, 5, NOW);
    expect(r.reps).toBe(1);
    expect(r.interval).toBe(1);
  });

  it("schedules next_review_at +1 day", () => {
    const r = applySm2(BASE, 5, NOW);
    expect(r.next_review_at).toBe(daysLater(1));
  });

  it("increases ease by 0.1 for quality=5", () => {
    const r = applySm2(BASE, 5, NOW);
    expect(r.ease).toBeCloseTo(2.6, 5);
  });
});

describe("applySm2 — correct second time (reps=1, quality=5)", () => {
  it("sets reps=2, interval=6", () => {
    const r = applySm2({ ...BASE, sm2_reps: 1, sm2_interval: 1 }, 5, NOW);
    expect(r.reps).toBe(2);
    expect(r.interval).toBe(6);
  });

  it("schedules next_review_at +6 days", () => {
    const r = applySm2({ ...BASE, sm2_reps: 1, sm2_interval: 1 }, 5, NOW);
    expect(r.next_review_at).toBe(daysLater(6));
  });
});

describe("applySm2 — mature card (reps>=2)", () => {
  it("interval = round(prev_interval * ease)", () => {
    const r = applySm2({ sm2_ease: 2.5, sm2_interval: 6, sm2_reps: 2 }, 5, NOW);
    expect(r.interval).toBe(Math.round(6 * 2.5));
    expect(r.reps).toBe(3);
  });

  it("next_review_at matches rounded interval", () => {
    const r = applySm2({ sm2_ease: 2.5, sm2_interval: 6, sm2_reps: 2 }, 5, NOW);
    expect(r.next_review_at).toBe(daysLater(Math.round(6 * 2.5)));
  });

  it("quality=3 on mature card — partial ease reduction", () => {
    const r = applySm2({ sm2_ease: 2.5, sm2_interval: 6, sm2_reps: 2 }, 3, NOW);
    expect(r.ease).toBeCloseTo(2.36, 5);
    expect(r.reps).toBe(3);
  });
});

describe("applySm2 — ease floor", () => {
  it("ease never drops below 1.3 even after repeated failures", () => {
    let card = { sm2_ease: 1.3, sm2_interval: 1, sm2_reps: 0 };
    for (let i = 0; i < 5; i++) {
      const r = applySm2(card, 0, NOW);
      expect(r.ease).toBeGreaterThanOrEqual(1.3);
      card = { sm2_ease: r.ease, sm2_interval: r.interval, sm2_reps: r.reps };
    }
  });
});
