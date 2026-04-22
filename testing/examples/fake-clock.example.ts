// Example: Fake Clock for LexiQuest tests.
// Copy into api/testing/fake-clock.ts (drop ".example") at Phase 2.
//
// Contract: see ../../docs/tdd/testability-patterns.md §3.3.

export interface Clock {
  /** Returns the current unix timestamp in milliseconds. */
  now(): number;
  /**
   * Returns the current date in the given IANA timezone as "YYYY-MM-DD".
   * Used for streak rollover, daily goal reset, and heatmap bucketing.
   */
  today(timeZone: string): string;
}

export class FakeClock implements Clock {
  private currentMs: number;

  constructor(initial: string | number) {
    this.currentMs = typeof initial === "string" ? Date.parse(initial) : initial;
    if (Number.isNaN(this.currentMs)) {
      throw new Error(`FakeClock: unparseable initial value "${initial}"`);
    }
  }

  now(): number {
    return this.currentMs;
  }

  today(timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(this.currentMs));
  }

  /** Advance the clock by the given number of milliseconds. */
  advance(ms: number): void {
    this.currentMs += ms;
  }

  /** Set the clock to an absolute moment (ISO string). */
  setDate(iso: string): void {
    const next = Date.parse(iso);
    if (Number.isNaN(next)) {
      throw new Error(`FakeClock.setDate: unparseable "${iso}"`);
    }
    this.currentMs = next;
  }
}

// Real implementation — kept alongside for comparison. Move to
// api/shared/clock.ts during Phase 2.
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  today(timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  }
}
