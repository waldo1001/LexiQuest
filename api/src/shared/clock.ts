export interface Clock {
  /** Current moment as a `Date`. */
  now(): Date;
  /** Current moment as epoch milliseconds. */
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}
