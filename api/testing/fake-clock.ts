import type { Clock } from "../src/shared/clock.js";

/**
 * In-memory clock whose `now()` starts at a given ISO timestamp and
 * only moves when you explicitly `advance(ms)` or `setDate(iso)`.
 * Use this in any unit test that touches SM-2 scheduling, streaks,
 * or daily-goal windows so tests are time-invariant.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(startIso = "2026-04-22T09:00:00Z") {
    this.current = new Date(startIso);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  nowMs(): number {
    return this.current.getTime();
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  setDate(iso: string): void {
    this.current = new Date(iso);
  }
}
