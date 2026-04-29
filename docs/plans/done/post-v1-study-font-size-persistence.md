# Plan — Fix: study_font_size setting is silently dropped by backend

## Context

User reports: *"The 'STUDY FONT SIZE' does not have any impact - also seems
it is not saved when changed."*

The frontend wiring is complete and correct:

- [Settings.jsx:21](frontend/src/screens/Settings.jsx:21) reads
  `user.settings.study_font_size`.
- [Settings.jsx:67-76](frontend/src/screens/Settings.jsx:67) handler calls
  `patchMe({ settings: { study_font_size: next } })`.
- [StudySession.jsx:176-177](frontend/src/screens/StudySession.jsx:176)
  maps the value to a CSS `fontSize` and applies it inline at
  [StudySession.jsx:415](frontend/src/screens/StudySession.jsx:415).

The defect is purely server-side. `PATCH /api/me` runs through
`validatePatch()` in [api/src/functions/me.ts:53-111](api/src/functions/me.ts:53),
which has explicit handlers for `auto_speak`, `preferred_mode`,
`daily_goal`, and `theme`, but **no handler for `study_font_size`**.
Unknown settings keys are silently ignored — they never make it into the
patch object, so the merge at [me.ts:141-147](api/src/functions/me.ts:141)
discards them. The endpoint returns 200 OK and the user assumes it saved.

The `UserRow.settings` type in [api/src/shared/seed.ts:16-26](api/src/shared/seed.ts:16)
also does not declare the field, so even if the validator added it, the
type would need to grow first.

This change adds backend support for `study_font_size`, mirroring the
established pattern for `theme`.

## Task

Make `study_font_size` a first-class persisted user setting on the backend
so values selected in the Settings screen survive a page reload.

## Scope boundary

**IN**

- Add `study_font_size?: "normal" | "large" | "xlarge"` to the
  `UserRow.settings` type in `api/src/shared/seed.ts`.
- Add a `STUDY_FONT_SIZES` allowlist + validation branch to
  `validatePatch()` in `api/src/functions/me.ts`, following the exact
  shape of the existing `theme` handler at lines 100-106.
- Add unit tests in `api/src/functions/me.test.ts` mirroring the existing
  theme tests at lines 322-344.

**OUT**

- `validateSettings()` in `api/src/functions/users-shared.ts` — that's
  the admin user-create/edit path and currently doesn't validate `theme`
  either. Keeping the asymmetry consistent with the existing pattern;
  flag for a separate cleanup if desired.
- Frontend changes — already wired correctly.
- A migration / backfill for existing user rows. The field is optional;
  existing rows without it fall back to `"normal"` via the `??`
  operators on the frontend.
- `seed.ts:128-133` default settings — leaving `study_font_size`
  unset (defaults to `"normal"` via frontend fallback). No need to
  re-seed.

## Files to touch

- [api/src/shared/seed.ts:16-26](api/src/shared/seed.ts:16) — add
  optional field to `UserRow.settings`.
- [api/src/functions/me.ts](api/src/functions/me.ts):
  - Add `type StudyFontSize = NonNullable<UserSettings["study_font_size"]>`
    near the existing type aliases (lines 17-20).
  - Add `const STUDY_FONT_SIZES = new Set<StudyFontSize>(["normal", "large", "xlarge"])`
    near line 29 with the other allowlists.
  - Add a `if ("study_font_size" in sr) { ... }` branch in
    `validatePatch` after the `theme` branch (~line 106), pattern-
    matching the theme handler.
- [api/src/functions/me.test.ts](api/src/functions/me.test.ts) —
  add the two RED tests below after the theme tests at line 344.

## Seams involved

None new. The existing `TableStorage` seam carries the field through
unchanged (Table Storage row shape is duck-typed).

## RED test list

- **AC1**: PATCH /me with a valid `study_font_size` persists the value.
  - file: `api/src/functions/me.test.ts`
  - name: `"PATCH /me accepts valid study_font_size and persists it"`
  - body: `{ settings: { study_font_size: "large" } }` → 200, then
    re-read user row and assert `settings.study_font_size === "large"`.
  - seams: in-memory `TableStorage` fake (already used by the file).
  - edge cases: also verify `"xlarge"` round-trips in the same test or
    a sibling test — the validator must accept all three values.

- **AC2**: PATCH /me with an invalid `study_font_size` returns 400.
  - file: `api/src/functions/me.test.ts`
  - name: `"PATCH /me rejects invalid study_font_size with 400"`
  - body: `{ settings: { study_font_size: "huge" } }` → 400.
  - seams: same fake.
  - edge cases: non-string value (e.g. `42`) should also 400 — covered
    by the `typeof th !== "string"` check we'll mirror.

- **AC3** (regression guard): patching `study_font_size` does not wipe
  other settings.
  - file: `api/src/functions/me.test.ts`
  - name: `"PATCH /me preserves other settings when only study_font_size changes"`
  - Setup: user has `auto_speak: true, preferred_mode: "ask"`, etc.
    PATCH only `study_font_size`. Assert all other fields unchanged.
  - This is already covered structurally by the merge at lines 144-146,
    but worth one explicit test since the bug report names persistence.

## Verification (post-GREEN)

1. Run `npm test -- me` from `api/` — all three new tests pass; existing
   theme/preferred_mode/daily_goal tests still pass.
2. Coverage on touched files stays at Tier A 90% (`api/` floor).
3. Manual smoke via `/dev-start`:
   - Log in as a seeded user.
   - Settings → change Study font size to "Extra large" → reload page →
     verify the dropdown still shows "Extra large".
   - Start a study session → verify the card text is visibly larger.
4. `/security-scan` — no findings expected (no secrets, no auth changes).

## Risks

- Very low. The change is additive: a new optional field, a new branch
  in a validator that already ignores unknown fields. No data
  migration, no behavioral change for users who never touch the
  setting.
- One thing to watch: the `users-shared.ts` validator does NOT learn
  about `study_font_size`, so an admin editing another user via
  `PATCH /api/users/:id` cannot set this field. That mirrors the
  existing handling of `theme` and is intentional in this slice.

## Out-of-scope follow-ups

- (Optional) Bring `users-shared.ts:validateSettings` to parity with
  `me.ts` for both `theme` and `study_font_size` if admins need to
  set these on other users.
