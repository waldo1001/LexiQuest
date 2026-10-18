import type { SessionRow } from "../src/functions/sessions-shared.js";
import type { UserRow } from "../src/shared/seed.js";

const EPOCH = "2026-01-01T00:00:00.000Z";

/** A SessionRow with every required field defaulted; a new row field is a one-line change here. */
export function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    partitionKey: "u1",
    rowKey: `${EPOCH}_s1`,
    user_id: "u1",
    course_id: "c1",
    mode: "self_grade",
    game_type: "classic",
    card_limit: null,
    card_order: "random",
    started_at: EPOCH,
    ended_at: null,
    cards_studied: 0,
    cards_correct: 0,
    xp_earned: 0,
    duration_seconds: 0,
    ...overrides,
  };
}

export type UserRowOverrides = Partial<Omit<UserRow, "settings">> & {
  settings?: Partial<UserRow["settings"]>;
};

/**
 * A UserRow with every required field defaulted. `settings` merges shallowly over the
 * defaults the user tests share ({ auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 }).
 */
export function makeUserRow(overrides: UserRowOverrides = {}): UserRow {
  const { settings, ...rest } = overrides;
  return {
    partitionKey: "users",
    rowKey: "u1",
    name: "Lex",
    password_hash: "x",
    is_admin: false,
    color: "#111111",
    avatar_emoji: "🦊",
    ui_language: "en",
    created_at: EPOCH,
    ...rest,
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10, ...settings },
  };
}
