import { describe, it, expect } from "vitest";
import {
  computeNewStreak,
  shouldAwardFreezeToken,
  type StreakState,
} from "./streak.js";

const TZ = "Europe/Brussels";

function state(overrides: Partial<StreakState> = {}): StreakState {
  return {
    streak: 0,
    last_session_date: null,
    freeze_tokens: 0,
    ...overrides,
  };
}

describe("computeNewStreak", () => {
  it("AC1: first ever session → streak becomes 1", () => {
    const result = computeNewStreak(state(), "2026-04-22T10:00:00.000Z", TZ);
    expect(result.streak).toBe(1);
    expect(result.last_session_date).toBe("2026-04-22");
  });

  it("AC2: session on same day as last session → streak unchanged", () => {
    const s = state({ streak: 3, last_session_date: "2026-04-22" });
    const result = computeNewStreak(s, "2026-04-22T20:00:00.000Z", TZ);
    expect(result.streak).toBe(3);
    expect(result.last_session_date).toBe("2026-04-22");
  });

  it("AC3: session the next calendar day → streak increments", () => {
    const s = state({ streak: 3, last_session_date: "2026-04-22" });
    const result = computeNewStreak(s, "2026-04-23T08:00:00.000Z", TZ);
    expect(result.streak).toBe(4);
    expect(result.last_session_date).toBe("2026-04-23");
  });

  it("AC4: missed one day with no freeze → streak resets to 1", () => {
    const s = state({ streak: 5, last_session_date: "2026-04-21", freeze_tokens: 0 });
    const result = computeNewStreak(s, "2026-04-23T10:00:00.000Z", TZ);
    expect(result.streak).toBe(1);
    expect(result.freeze_tokens).toBe(0);
  });

  it("AC5: missed one day with a freeze token → freeze consumed, streak continues", () => {
    const s = state({ streak: 5, last_session_date: "2026-04-21", freeze_tokens: 1 });
    const result = computeNewStreak(s, "2026-04-23T10:00:00.000Z", TZ);
    expect(result.streak).toBe(6);
    expect(result.freeze_tokens).toBe(0);
  });

  it("AC6: missed two days with freeze → only one day can be saved, streak resets", () => {
    const s = state({ streak: 5, last_session_date: "2026-04-20", freeze_tokens: 2 });
    const result = computeNewStreak(s, "2026-04-23T10:00:00.000Z", TZ);
    // gap = 3 days → freeze covers 1 → still 2 gaps → reset
    expect(result.streak).toBe(1);
    expect(result.freeze_tokens).toBe(2); // not consumed (can't save streak)
  });

  it("AC6b: next-day streak reaching milestone awards a freeze token", () => {
    const s = state({ streak: 13, last_session_date: "2026-04-21", freeze_tokens: 0 });
    const result = computeNewStreak(s, "2026-04-22T10:00:00.000Z", TZ);
    expect(result.streak).toBe(14);
    expect(result.freeze_tokens).toBe(1);
    expect(result.freeze_awarded).toBe(true);
  });

  it("AC5b: freeze-save reaching milestone awards a freeze (if room)", () => {
    const s = state({ streak: 13, last_session_date: "2026-04-20", freeze_tokens: 1 });
    const result = computeNewStreak(s, "2026-04-22T10:00:00.000Z", TZ); // gap=2, freeze saves it
    expect(result.streak).toBe(14);
    expect(result.freeze_tokens).toBe(1); // used 1, gained 1 at milestone → net 1
    expect(result.freeze_awarded).toBe(true);
  });

  it("AC7: freeze tokens capped at 2", () => {
    const s = state({ streak: 28, last_session_date: "2026-04-21", freeze_tokens: 2 });
    const result = computeNewStreak(s, "2026-04-22T10:00:00.000Z", TZ);
    // No freeze awarded (already at max 2)
    expect(result.freeze_tokens).toBe(2);
  });
});

describe("shouldAwardFreezeToken", () => {
  it("AC8: awards at 14-day streak milestone", () => {
    expect(shouldAwardFreezeToken(14)).toBe(true);
    expect(shouldAwardFreezeToken(28)).toBe(true);
    expect(shouldAwardFreezeToken(42)).toBe(true);
  });

  it("AC9: no award for non-multiples of 14", () => {
    expect(shouldAwardFreezeToken(1)).toBe(false);
    expect(shouldAwardFreezeToken(13)).toBe(false);
    expect(shouldAwardFreezeToken(15)).toBe(false);
  });

  it("AC10: no award at 0", () => {
    expect(shouldAwardFreezeToken(0)).toBe(false);
  });
});
