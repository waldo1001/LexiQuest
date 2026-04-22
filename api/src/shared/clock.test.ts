import { describe, it, expect } from "vitest";
import { SystemClock } from "./clock.js";
import { FakeClock } from "../../testing/fake-clock.js";

describe("SystemClock", () => {
  it("returns a Date from now()", () => {
    const clock = new SystemClock();
    expect(clock.now()).toBeInstanceOf(Date);
  });

  it("returns monotonic-ish ms; not going backwards across calls", () => {
    const clock = new SystemClock();
    const a = clock.nowMs();
    const b = clock.nowMs();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});

describe("FakeClock", () => {
  it("starts at the given ISO", () => {
    const clock = new FakeClock("2026-01-01T12:00:00Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("advance(ms) moves forward", () => {
    const clock = new FakeClock("2026-01-01T00:00:00Z");
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("setDate(iso) jumps", () => {
    const clock = new FakeClock();
    clock.setDate("2027-06-15T10:30:00Z");
    expect(clock.now().toISOString()).toBe("2027-06-15T10:30:00.000Z");
  });

  it("nowMs() tracks now()", () => {
    const clock = new FakeClock("2026-04-22T00:00:00Z");
    expect(clock.nowMs()).toBe(clock.now().getTime());
  });
});
