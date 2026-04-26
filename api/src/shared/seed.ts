import type { Clock } from "./clock.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { Random } from "./random.js";
import type { Entity, TableStorage } from "./table-storage.js";

export interface UserRow extends Entity {
  partitionKey: "users";
  rowKey: string;
  name: string;
  password_hash: string;
  is_admin: boolean;
  color: string;
  avatar_emoji: string;
  ui_language: "nl" | "en";
  settings: {
    auto_speak: boolean;
    preferred_mode: "self_grade" | "mcq" | "mixed" | "ask";
    daily_goal: number;
    theme?: "classic" | "playful" | "arcade";
    streak?: number;
    last_session_date?: string | null;
    freeze_tokens?: number;
    total_xp?: number;
    badges?: string[];
  };
  created_at: string;
}

export interface YearRow extends Entity {
  partitionKey: "years";
  rowKey: string;
  label: string;
  is_current: boolean;
  start_date: string;
  end_date: string;
}

export interface SeedUserSpec {
  name: string;
  is_admin: boolean;
  color: string;
  avatar_emoji: string;
}

export const SEED_USERS: readonly SeedUserSpec[] = [
  { name: "Waldo", is_admin: true, color: "#2563eb", avatar_emoji: "🦊" },
  { name: "Lex", is_admin: false, color: "#16a34a", avatar_emoji: "🐯" },
  { name: "Mats", is_admin: false, color: "#dc2626", avatar_emoji: "🐻" },
  { name: "Ben", is_admin: false, color: "#9333ea", avatar_emoji: "🐼" },
  { name: "Kaat", is_admin: false, color: "#f59e0b", avatar_emoji: "🐰" },
  { name: "Amaryllis", is_admin: false, color: "#ec4899", avatar_emoji: "🌸" },
];

export class SeedMissingPasswordError extends Error {
  constructor() {
    super("seed: one or more required passwords were not provided");
    this.name = "SeedMissingPasswordError";
  }
}

export interface SeedOptions {
  tables: TableStorage;
  hasher: PasswordHasher;
  clock: Clock;
  random: Random;
  /** Return the plaintext password for a user by name, or undefined. */
  getPassword: (userName: string) => string | undefined;
}

export interface SeedResult {
  users: { id: string; name: string; created: boolean }[];
  year: { id: string; label: string; created: boolean };
}

export async function seed(opts: SeedOptions): Promise<SeedResult> {
  const { tables, hasher, clock, random, getPassword } = opts;

  // Users — idempotent via name lookup.
  const existing = await tables.listByPartition<UserRow>("users", "users");
  const byName = new Map(existing.map((u) => [u.name, u]));
  const userResults: SeedResult["users"] = [];

  for (const spec of SEED_USERS) {
    const existingRow = byName.get(spec.name);
    if (existingRow) {
      userResults.push({
        id: existingRow.rowKey,
        name: spec.name,
        created: false,
      });
      continue;
    }
    const plaintext = getPassword(spec.name);
    if (plaintext === undefined || plaintext.length === 0) {
      throw new SeedMissingPasswordError();
    }
    const hashed = await hasher.hash(plaintext);
    const id = random.uuid();
    const row: UserRow = {
      partitionKey: "users",
      rowKey: id,
      name: spec.name,
      password_hash: hashed,
      is_admin: spec.is_admin,
      color: spec.color,
      avatar_emoji: spec.avatar_emoji,
      ui_language: "nl",
      settings: {
        auto_speak: true,
        preferred_mode: "ask",
        daily_goal: 20,
        theme: "playful",
      },
      created_at: clock.now().toISOString(),
    };
    await tables.upsert<UserRow>("users", row);
    userResults.push({ id, name: spec.name, created: true });
  }

  // Year — idempotent via label lookup.
  const now = clock.now();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const [startYear, endYear] = month >= 9 ? [year, year + 1] : [year - 1, year];
  const label = `${startYear}-${endYear}`;

  const years = await tables.listByPartition<YearRow>("years", "years");
  const existingYear = years.find((y) => y.label === label);
  if (existingYear) {
    return {
      users: userResults,
      year: { id: existingYear.rowKey, label, created: false },
    };
  }

  const yearId = random.uuid();
  const yearRow: YearRow = {
    partitionKey: "years",
    rowKey: yearId,
    label,
    is_current: true,
    start_date: `${startYear}-09-01`,
    end_date: `${endYear}-06-30`,
  };
  await tables.upsert<YearRow>("years", yearRow);
  return {
    users: userResults,
    year: { id: yearId, label, created: true },
  };
}
