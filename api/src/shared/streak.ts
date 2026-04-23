const MAX_FREEZE_TOKENS = 2;
const FREEZE_MILESTONE = 14;

export interface StreakState {
  streak: number;
  last_session_date: string | null; // "YYYY-MM-DD" in user's timezone
  freeze_tokens: number;
}

export interface StreakResult extends StreakState {
  freeze_awarded: boolean;
}

function toLocalDate(isoTimestamp: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTimestamp));
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / 86_400_000);
}

export function computeNewStreak(
  state: StreakState,
  nowIso: string,
  tz: string,
): StreakResult {
  const today = toLocalDate(nowIso, tz);
  let { streak, last_session_date, freeze_tokens } = state;
  let freeze_awarded = false;

  if (!last_session_date) {
    // First ever session
    streak = 1;
    last_session_date = today;
    // Check if new streak earns a freeze
    if (shouldAwardFreezeToken(streak) && freeze_tokens < MAX_FREEZE_TOKENS) {
      freeze_tokens = Math.min(freeze_tokens + 1, MAX_FREEZE_TOKENS);
      freeze_awarded = true;
    }
    return { streak, last_session_date, freeze_tokens, freeze_awarded };
  }

  const gap = daysBetween(last_session_date, today);

  if (gap === 0) {
    // Same day — streak unchanged
    return { streak, last_session_date, freeze_tokens, freeze_awarded };
  }

  if (gap === 1) {
    // Next day — streak increments
    streak += 1;
    last_session_date = today;
    if (shouldAwardFreezeToken(streak) && freeze_tokens < MAX_FREEZE_TOKENS) {
      freeze_tokens = Math.min(freeze_tokens + 1, MAX_FREEZE_TOKENS);
      freeze_awarded = true;
    }
    return { streak, last_session_date, freeze_tokens, freeze_awarded };
  }

  // gap >= 2: missed at least one day
  if (gap === 2 && freeze_tokens > 0) {
    // Exactly one missed day — freeze saves the streak
    streak += 1;
    freeze_tokens -= 1;
    last_session_date = today;
    if (shouldAwardFreezeToken(streak) && freeze_tokens < MAX_FREEZE_TOKENS) {
      freeze_tokens = Math.min(freeze_tokens + 1, MAX_FREEZE_TOKENS);
      freeze_awarded = true;
    }
    return { streak, last_session_date, freeze_tokens, freeze_awarded };
  }

  // Too many missed days — streak resets
  streak = 1;
  last_session_date = today;
  return { streak, last_session_date, freeze_tokens, freeze_awarded };
}

export function shouldAwardFreezeToken(streak: number): boolean {
  return streak > 0 && streak % FREEZE_MILESTONE === 0;
}
