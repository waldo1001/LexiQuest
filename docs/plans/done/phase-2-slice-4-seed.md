---
phase: 2
slice: 4
name: seed script (4 users + current year)
status: proposed
---

# Phase 2 · Slice 4 — `scripts/seed.ts`

## 1. Task

Write an idempotent seed that, given a `TableStorage` and a
`PasswordHasher`, creates four users (Waldo admin + Lex + Mats + Ben)
with bcrypt-hashed passwords from env vars, and the current school
year row, without duplicating on re-run.

## 2. Scope (IN / OUT)

**IN**

- `api/src/shared/seed.ts` — pure `seed(opts)` that takes
  `{ tables, hasher, clock, random, getPassword }` and runs the
  idempotent inserts. No env-var reads, no process.exit.
- `api/src/shared/seed.test.ts` — unit tests covering:
  (a) happy path creates 4 users + 1 year;
  (b) re-run is a no-op (same ids, same hashes);
  (c) password-missing throws a named error that does not leak the
      user name or password.
- `api/scripts/seed.ts` — small bin (~15 lines) that composes
  `AzureTableStorage + BcryptPasswordHasher + SystemClock + SystemRandom`,
  reads passwords from env, calls `seed()`, logs a summary of ids
  (no hashes). v8-ignored.
- Add `seed` script to `api/package.json`.
- `.env.example` at repo root documenting the four
  `PASSWORD_*` env vars and `AZURE_STORAGE_CONNECTION_STRING`.

**OUT**

- Actually running the seed against real Azurite → Slice 5.
- Roles / permissions beyond `is_admin` — that's already the field.
- A "destroy" counterpart — out of scope.

## 3. Files

- `api/src/shared/seed.ts`
- `api/src/shared/seed.test.ts`
- `api/scripts/seed.ts` (v8-ignored composition root)
- `api/package.json` (+ `seed` script, + `dotenv` dev dep for the bin)
- `.env.example` (repo-root, documenting env contract)

## 4. Seams

`tables`, `hasher`, `clock`, `random`.

## 5. RED list

- **AC1**: First run inserts 4 user rows into `users` partition.
  - name: `"inserts 4 users when run against an empty store"`
- **AC2**: First run inserts 1 year row with `is_current: true`.
  - name: `"inserts a current year row"`
- **AC3**: User rows carry hashed (never plaintext) passwords.
  - name: `"hashes passwords (no plaintext in the stored row)"`
- **AC4**: Second run on same store is a no-op — same users, same
  hashes as after run 1.
  - name: `"idempotent on re-run"`
- **AC5**: `getPassword(userName)` returning `undefined` throws a
  named error whose message does NOT contain the password or the
  user name.
  - name: `"throws SeedMissingPasswordError with a redacted message"`
- **AC6**: Only one user has `is_admin: true` (Waldo).
  - name: `"exactly one admin after seed"`

## 6. Assumptions

- Current year label computed from clock: if month >= 9 (Sep+),
  label = `{thisYear}-{nextYear}`, else `{prevYear}-{thisYear}`.
  Start/end dates: Sept 1 → Jun 30.
- Users get fixed UUIDs per scripted `FakeRandom` in tests; real bin
  uses `SystemRandom`. Idempotency uses the user's *name* — on
  re-run we look up `users / users / <existing-id>` by
  listByPartition and match on `name`; if found, skip insert.
  (We can't re-derive the UUID.)
- Passwords: `PASSWORD_WALDO`, `PASSWORD_LEX`, `PASSWORD_MATS`,
  `PASSWORD_BEN` env vars. Empty = seed errors.

## 7. Risks

- A failure mid-seed leaves a partial state. Mitigation: not
  catastrophic because of idempotency — re-run completes. Fully
  transactional semantics aren't supported by Table Storage, so we
  accept best-effort.
- Leaking a password in the error message is a security violation
  caught by /security-scan. Mitigation: explicit named error with a
  static message; unit test asserts redaction.

## 8. Out-of-scope

- Slice 5: Azurite contract runner + manual smoke.
- Phase 5: admin endpoints to create/delete users at runtime.
