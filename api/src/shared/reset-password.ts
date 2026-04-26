import type { PasswordHasher } from "./password-hasher.js";
import type { TableStorage } from "./table-storage.js";
import type { UserRow } from "./seed.js";
import { SEED_USERS } from "./seed.js";

export interface ResetPasswordOptions {
  tables: TableStorage;
  hasher: PasswordHasher;
  /** Human name (e.g. "Lex"); rowKeys are opaque UUIDs. Case-sensitive. */
  name: string;
  /** Plaintext; must be non-empty. */
  password: string;
}

export interface ResetPasswordResult {
  id: string;
  name: string;
  updated: boolean;
}

export class UserNotFoundError extends Error {
  constructor() {
    super("user not found");
    this.name = "UserNotFoundError";
  }
}

export class MissingPasswordError extends Error {
  constructor() {
    super("password is required");
    this.name = "MissingPasswordError";
  }
}

export class BulkNoOpError extends Error {
  constructor() {
    super(
      "reset-password bulk: no PASSWORD_<NAME> env var was set; nothing to do",
    );
    this.name = "BulkNoOpError";
  }
}

export async function resetPassword(
  opts: ResetPasswordOptions,
): Promise<ResetPasswordResult> {
  const { tables, hasher, name, password } = opts;
  if (typeof password !== "string" || password.length === 0) {
    throw new MissingPasswordError();
  }
  const rows = await tables.listByPartition<UserRow>("users", "users");
  const existing = rows.find((r) => r.name === name);
  if (!existing) {
    throw new UserNotFoundError();
  }
  const password_hash = await hasher.hash(password);
  const merged: UserRow = { ...existing, password_hash };
  await tables.upsert<UserRow>("users", merged);
  return { id: existing.rowKey, name: existing.name, updated: true };
}

export interface ResetPasswordsBulkOptions {
  tables: TableStorage;
  hasher: PasswordHasher;
  /** Returns the plaintext password for a user by name, or undefined/"". */
  getPassword: (name: string) => string | undefined;
}

export async function resetPasswordsBulk(
  opts: ResetPasswordsBulkOptions,
): Promise<ResetPasswordResult[]> {
  const { tables, hasher, getPassword } = opts;
  const rows = await tables.listByPartition<UserRow>("users", "users");
  const byName = new Map(rows.map((r) => [r.name, r]));

  const results: ResetPasswordResult[] = [];
  let anyUpdated = false;

  for (const spec of SEED_USERS) {
    const existing = byName.get(spec.name);
    if (!existing) continue;
    const plaintext = getPassword(spec.name);
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      results.push({ id: existing.rowKey, name: existing.name, updated: false });
      continue;
    }
    const password_hash = await hasher.hash(plaintext);
    await tables.upsert<UserRow>("users", { ...existing, password_hash });
    results.push({ id: existing.rowKey, name: existing.name, updated: true });
    anyUpdated = true;
  }

  if (!anyUpdated) {
    throw new BulkNoOpError();
  }
  return results;
}
