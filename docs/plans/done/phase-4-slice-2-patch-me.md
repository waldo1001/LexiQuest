---
phase: 4
slice: 2
name: PATCH /api/me for ui_language + settings
status: proposed
---

# Phase 4 · Slice 2 — `PATCH /api/me`

## 1. Task

Add `PATCH /api/me` so an authenticated user can update their own
`ui_language` and/or `settings`, and wire `AppContext.setLang` to
persist the choice through that endpoint.

## 2. Scope boundary

**IN**

- Extend `api/src/functions/me.ts` to dispatch on `req.method`:
  - `GET` — unchanged.
  - `PATCH` — read body, validate, merge onto the user row, upsert,
    return the same shape as GET.
  - Other methods → 405.
- Validation:
  - `ui_language`, when present, must equal `"en"` or `"nl"`.
  - `settings`, when present, must be an object; any provided key
    among `auto_speak` (bool), `preferred_mode`
    (`"self_grade"|"mcq"|"mixed"|"ask"`), `daily_goal` (positive
    integer) must have the right type. Unknown keys are dropped.
  - Other fields in the body (`userId`, `is_admin`, `name`,
    `password_hash`, `color`, `avatar_emoji`, `created_at`) are
    ignored — immutable via this endpoint. **Invariant 1**: `userId`
    always comes from `requireAuth`, never from body.
- `password_hash` never appears in the response (regression check).
- Frontend `src/lib/api.js`: add `patchMe({ ui_language?, settings?
  }, { fetchFn? })` with the same DI pattern as other wrappers.
- Frontend `AppProvider`: accept an injected `patchMe` prop; rewire
  `setLang(lang)` to call `patchMe({ ui_language: lang })` and only
  update local state on success. On failure, lang stays unchanged.

**OUT (deferred)**

- Settings screen UI with language toggle → Slice 3.
- `<html lang>` reactive sync → Slice 3.
- Hydrating `AppProvider` from `/api/me` on mount → Slice 3 (tied to
  the Settings screen and persistence-across-refresh UX).
- Admin editing other users' settings → Phase 5.

## 3. Files to create / touch

API:

- `api/src/functions/me.ts` — dispatch on method; add PATCH path.
- `api/src/functions/me.test.ts` — add PATCH describe block.
- `api/src/shared/seed.ts` — add a shared `UiLanguage` /
  `UserSettings` type export if convenient (optional — may inline).

Frontend:

- `frontend/src/lib/api.js` — add `patchMe()`.
- `frontend/src/lib/api.test.js` — add PATCH cases.
- `frontend/src/context/AppContext.jsx` — accept `patchMe` prop; make
  `setLang` async and server-first.
- `frontend/src/context/AppContext.test.jsx` — add tests for the
  async setLang path (success + failure).

## 4. Seams

- API: `tables` (update row), `signer` (via `requireAuth`).
- Frontend: `fetch` (injected into `api.js`).

No new seams.

## 5. RED list

Backend (Tier A 90%):

- **P1** PATCH /api/me without a cookie → 401.
- **P2** PATCH with `{ui_language:"en"}` upserts the row and returns
  the updated profile with `ui_language:"en"`.
- **P3** PATCH with `{settings:{daily_goal:30}}` merges onto existing
  settings (doesn't zero `auto_speak` / `preferred_mode`).
- **P4** PATCH with both `ui_language` and `settings` updates both.
- **P5** PATCH with `{ui_language:"fr"}` → 400.
- **P6** PATCH with `{settings:{daily_goal:"thirty"}}` → 400.
- **P7** PATCH with `{is_admin:true, name:"Eve", password_hash:"x",
  userId:"u-other"}` does not mutate any of those fields; response
  reflects the un-tampered row. **(Invariant 1 regression.)**
- **P8** GET after PATCH still works (method dispatch).
- **P9** PATCH for a stale session (signed userId whose row was
  deleted) → 404.
- **P10** PATCH with `{}` returns the current profile unchanged,
  status 200.
- **P11** Response never contains `password_hash`.
- **P12** A POST (unsupported method) → 405.

Frontend `api.js` (Tier A 90%):

- **F1** `patchMe({ui_language:"en"}, {fetchFn})` sends
  `PATCH /api/me` with JSON body + `credentials:"include"`; returns
  parsed JSON on 200.
- **F2** `patchMe` throws on 401.
- **F3** `patchMe` throws on 400.

Frontend `AppContext` (Tier A 90%):

- **X1** `setLang("nl")` calls the injected `patchMe` with
  `{ui_language:"nl"}` and updates context `lang` on resolve.
- **X2** If `patchMe` rejects, context `lang` stays at its previous
  value (no unconditional optimistic update).
- **X3** Prior sync behavior not broken: a provider without a
  `patchMe` prop still mounts (we verify by using an injected
  resolver in tests — no real fetch).

Meta:

- `auth-boundary.test.ts` still passes (implicit — rerun whole suite
  in COVER).

## 6. Open questions / assumptions

- **Assumption**: PATCH semantics are "shallow merge" — `settings` is
  merged key-by-key; un-mentioned keys remain as they were. Known
  keys only; unknown keys in `settings` are silently dropped (since
  the Design type is closed). Deferred: a later phase can promote
  unknown settings to pass-through if needed.
- **Assumption**: `daily_goal` is a positive integer (>= 1). Zero and
  floats are rejected. This matches the Design intent ("daily goal").
- **Assumption**: `preferred_mode` accepts the four values from
  `UserRow.settings.preferred_mode`. Anything else → 400.
- **Assumption**: `AppProvider.setLang` becomes async but callers
  (Slice 3 Settings toggle) can `await` or fire-and-forget — we
  return a promise so callers can decide.
- **Assumption**: On PATCH failure (network / 500), `setLang` logs
  nothing this slice; UI-level error surfacing is Slice 3 (toggle
  shows a toast on failure).

## 7. Risks

- **Method-dispatch regression**: splitting GET/PATCH by method in a
  single handler must not regress the existing GET behavior. Covered
  by P8 and the existing GET tests.
- **Invariant 1 via PATCH**: the body could plausibly carry a
  `userId` that a naïve implementation would trust. Covered by P7.
- **Partial-settings merge vs replace**: test P3 locks in merge
  semantics so a future refactor can't silently flip to replace.
- **`AppProvider` async setLang churn**: existing `setLang` tests
  used sync behavior. Slice 2 changes them — we update the test
  wrappers to await the returned promise.

## 8. Out-of-scope follow-ups

- Slice 3 — Settings screen language toggle + `<html lang>` sync +
  AppProvider hydration from `/api/me` on mount.
- Future — admin editing another user's settings (Phase 5).
- Future — granular 403 when a non-self id is attempted (moot while
  the endpoint ignores body userId).
