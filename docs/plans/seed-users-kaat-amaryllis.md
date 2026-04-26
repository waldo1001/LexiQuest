# Plan — Seed users: hide Waldo as supervisor, add Kaat and Amaryllis

## Context

The four seeded family users today are **Waldo (admin), Lex, Mats, Ben**.
In real life, Waldo is the parent/supervisor — he is not a "student" using
the app to study. He should keep his admin role (so he can still log in
and manage accounts via the admin surface) but should **not** appear in
the student-facing user picker.

Two additional family members — **Kaat** and **Amaryllis** — should be
seeded as regular student users alongside Lex, Mats, and Ben.

End-state student picker (alphabetical, the way `/api/users/public`
already sorts): **Amaryllis, Ben, Kaat, Lex, Mats**. Waldo still exists
in the `users` table as `is_admin: true` but is filtered out of the
public picker.

## Task (one sentence)

Add Kaat and Amaryllis to `SEED_USERS` and filter `is_admin === true`
users out of `GET /api/users/public` so Waldo is invisible in the
student picker but remains a working admin account.

## Scope — IN

1. **Seed array** ([api/src/shared/seed.ts](../../api/src/shared/seed.ts:45)) —
   append two `SeedUserSpec` entries for Kaat and Amaryllis. Waldo,
   Lex, Mats, Ben stay as-is.
2. **Public-list endpoint** ([api/src/functions/users-public.ts](../../api/src/functions/users-public.ts:17)) —
   filter `r.is_admin !== true` before projecting/sorting. This is the
   "hide Waldo from the picker" mechanic. Generalises: any future
   admin-only account stays out of the picker too.
3. **Seed env-var loader** ([api/scripts/seed.ts](../../api/scripts/seed.ts)) —
   confirm the existing `PASSWORD_${USER_NAME.toUpperCase()}` lookup
   already covers `PASSWORD_KAAT` / `PASSWORD_AMARYLLIS` (no code
   change expected — the loop is name-driven).
4. **Tests** — see RED list below.
5. **Docs** — `docs/setup.md`, `docs/deployment.md`, `README.md` get
   the two new env-var names and the updated user roster narrative.
6. **Live-environment runbook** — `docs/deployment.md` gets an
   explicit "Adding Kaat and Amaryllis to the live environment"
   subsection so the operator knows exactly which Azure SWA app
   settings to add and how to re-run the idempotent seed against
   prod (see "Live-environment doc updates" below for the wording
   skeleton).

## Scope — OUT

- No schema changes. `UserRow` is untouched.
- No changes to `POST /api/users` (admin create), `/api/login`,
  `requireAuth`, or `SessionSigner`.
- No frontend changes. `UserPicker.jsx` already renders whatever
  `/api/users/public` returns; filtering happens server-side.
- **Local Azurite DB rows are not wiped** (per user's choice). The
  existing Waldo/Lex/Mats/Ben rows stay. `npm run seed` is idempotent
  (looks up by name) so it will simply add Kaat and Amaryllis on next
  run. If Waldo's row needs to disappear from the local picker right
  now, that happens automatically the moment the public-list filter
  ships — no DB mutation needed.
- **The actual prod seeding step is an operator action.** This slice
  does not run `npm run seed` against production. It only ships the
  *documentation* the operator follows when they do.
- Password rotation, secrets-rotation cadence, and any audit logging
  remain out of scope.

## Files to create / touch

| File | Change |
|---|---|
| [api/src/shared/seed.ts](../../api/src/shared/seed.ts) | Add Kaat + Amaryllis to `SEED_USERS` (lines 45–50) |
| [api/src/shared/seed.test.ts](../../api/src/shared/seed.test.ts) | Update assertions on seeded user count/names |
| [api/src/functions/users-public.ts](../../api/src/functions/users-public.ts) | Filter `is_admin === true` rows |
| [api/src/functions/users-public.test.ts](../../api/src/functions/users-public.test.ts) | New test: admins are excluded from the public list |
| [docs/setup.md](../setup.md) | Add `PASSWORD_KAAT`, `PASSWORD_AMARYLLIS` to env-var table; update seed narrative (line ~114) |
| [docs/deployment.md](../deployment.md) | (a) Add `PASSWORD_KAAT` + `PASSWORD_AMARYLLIS` rows to the Application-settings table at lines 58–66; (b) extend the prod-seed shell snippet at lines 77–85 with the two new env vars; (c) add a new "Adding new family users to live" subsection right after §1d that walks the operator through SWA Configuration → re-seed → verify, framed as the step to take *after* this slice ships |
| [README.md](../../README.md) | Update student roster (lines 4–5, 28–29) — Waldo described as supervisor only |

## Seams involved

- `TableStorage` (read-only, via `listByPartition<UserRow>("users", "users")`)
- No new seams.

## Proposed defaults for the two new users

(These can be tweaked during RED; included so tests have concrete values.)

| Name | `is_admin` | `color` | `avatar_emoji` |
|---|---|---|---|
| Kaat | `false` | `#f59e0b` (amber) | `🐰` |
| Amaryllis | `false` | `#ec4899` (pink) | `🌸` |

Picked to (a) not collide with existing colours/emojis (blue/fox,
green/tiger, red/bear, purple/panda) and (b) for Amaryllis, echo the
flower-name.

## RED test list

Each line is one failing test that drives one piece of the change.

1. **`seed.test.ts`** — `SEED_USERS` contains exactly six entries with
   names `["Waldo", "Lex", "Mats", "Ben", "Kaat", "Amaryllis"]` (order-
   insensitive) and Waldo is the only one with `is_admin === true`.
2. **`seed.test.ts`** — Kaat's spec has `color: "#f59e0b"` and
   `avatar_emoji: "🐰"`, `is_admin: false`.
3. **`seed.test.ts`** — Amaryllis's spec has `color: "#ec4899"` and
   `avatar_emoji: "🌸"`, `is_admin: false`.
4. **`users-public.test.ts`** — given a `users` partition with one
   admin (`is_admin: true`) and two students, the response contains
   only the two students.
5. **`users-public.test.ts`** — the existing "admin status never leaks"
   test continues to pass (no `is_admin` field on any returned object).
6. **`users-public.test.ts`** — alphabetical sort still holds after the
   admin-filter is applied (regression guard for the sort step).

The seed-script and login tests do **not** need new RED tests: the
seeding loop is name-driven and the login endpoint is unchanged.

## Open questions / assumptions

- **Assumption**: "Hide Waldo from the picker" is correctly implemented
  by filtering `is_admin === true` server-side. Alternative would be
  an explicit `hidden_from_picker` boolean on `UserRow`, but that adds
  schema surface for one user. Filtering by role is cleaner and
  matches the user's framing ("merely the parent, the supervisor").
- **Assumption**: Colors `#f59e0b` and `#ec4899` and emojis `🐰`/`🌸`
  are acceptable defaults. If not, swap during RED — only the seed
  array and its test change.
- **Assumption**: No frontend test needs updating because
  `UserPicker.jsx` renders whatever the API returns; existing tests
  that mock the fetch won't care about Waldo being absent.

## Risks

- **Local Azurite already has a Waldo row.** With the filter shipped,
  he disappears from the picker on next reload — that is the desired
  outcome, but worth flagging so it's not mistaken for a regression.
- **`/admin` panel**: still gated by `AdminRoute` (frontend) +
  session-side `isAdmin` (API). Because Waldo's row stays in the
  table, admin login still works. No change needed there, but verify
  manually after the slice lands.
- **Tier-A coverage** on `api/src/functions/users-public.ts` — the new
  filter line must be exercised by the new RED test (item 4). Should
  bring the file to 100%.

## Live-environment doc updates (skeleton wording for `docs/deployment.md`)

To be inserted as a new subsection **§1e — "Adding Kaat and Amaryllis
to the live environment"**, immediately after §1d "Seed prod once".
Final wording is written during the GREEN/DOCS step; this skeleton
locks the *content* the operator needs:

> After the slice ships and `main` is deployed, the new code in
> `SEED_USERS` will not create Kaat or Amaryllis on its own — seeding
> only runs when an operator invokes it. To create them on live:
>
> 1. **Set their passwords as SWA app settings.** In the Azure portal:
>    SWA resource → **Configuration** → Application settings → add
>    `PASSWORD_KAAT` and `PASSWORD_AMARYLLIS`. Use strong, distinct
>    values. Save. (You do **not** need to redeploy — these are read
>    by the seed script, not by request handlers.)
> 2. **Re-run the seed locally against prod.** Same shell pattern as
>    §1d, with the two new vars added. The script is idempotent — it
>    will skip Waldo/Lex/Mats/Ben (already present) and create Kaat
>    and Amaryllis.
>
>    ```sh
>    cd api
>    AZURE_STORAGE_CONNECTION_STRING='<prod connection string>' \
>    PASSWORD_KAAT='<real>' PASSWORD_AMARYLLIS='<real>' \
>    npm run seed
>
>    unset AZURE_STORAGE_CONNECTION_STRING PASSWORD_KAAT PASSWORD_AMARYLLIS
>    ```
> 3. **Verify on the live URL**: open the picker — Kaat and Amaryllis
>    should appear; Waldo should not (he is filtered server-side as an
>    admin). Log in once as each new user with the password from step 1
>    to confirm the row was created and the hash matches.
> 4. **Rotate the env-var values out of your shell history** (`history
>    -c` if your shell logs them).

Two additional documentation touches in the same file:

- **§1c "Set the SWA app settings"** (lines 58–66): add two rows to
  the table — `PASSWORD_KAAT` / `PASSWORD_AMARYLLIS` — described as
  "Production password for the Kaat / Amaryllis seed user".
- **§1d "Seed prod once"** (lines 77–85): extend the example shell
  block to include the two new vars, mirroring the pattern already
  there for Waldo/Lex/Mats/Ben. This makes §1d a complete first-time
  prod seed and §1e a delta playbook for the same operation when only
  some users already exist.

The same env-var rows are mirrored into `docs/setup.md` for local dev
(no `Adding users to live` subsection there — that's prod-only).

## Out-of-scope follow-ups

- A "hidden from picker" flag if/when there's a second non-admin user
  who should also be hidden. Not needed today.
- Wiping/re-seeding local Azurite — user explicitly chose to leave
  local data as-is.
- Password rotation policy or audit logging for new-user creation.

## Verification

After GREEN:

1. `cd api && npm test -- seed users-public` — the six new RED tests
   pass; existing tests stay green.
2. `npm run seed` (with `PASSWORD_KAAT` and `PASSWORD_AMARYLLIS` set
   in `api/local.settings.json`) — Kaat and Amaryllis appear as new
   rows; Waldo/Lex/Mats/Ben rows untouched.
3. `/local-smoke` — boot SWA + Functions, hit `GET /api/users/public`,
   confirm response is the five students alphabetically (no Waldo);
   log in as Waldo with his existing password, confirm `/admin`
   loads.
4. **Docs render** — open `docs/deployment.md` in a Markdown preview.
   Confirm §1c table includes `PASSWORD_KAAT` and `PASSWORD_AMARYLLIS`,
   §1d shell block has both new vars, and §1e ("Adding Kaat and
   Amaryllis to the live environment") is present and self-contained.
5. **Operator dry-run** — read §1e top-to-bottom and confirm an
   operator with no other context could execute it without consulting
   the plan or asking. (Acceptance: every command, every Azure portal
   click, every verification step is named explicitly.)
6. Coverage: `api/` Tier-A 90% floor still met on touched files.
