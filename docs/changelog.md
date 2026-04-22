# Changelog — LexiQuest

Reverse chronological. Newest date first. One line per change, past tense,
plain English. Link the most relevant doc or plan.

## 2026-04-22 (Phase 8)

- Implemented `applySm2(card, quality, now)` pure function in `api/src/shared/sm2.ts` and mirrored to `frontend/src/lib/sm2.js`; covers quality-0 reset, rep-0→1 day, rep-1→6 day, rep-2+ × ease, ease floor 1.3, 13 API tests + 5 frontend tests.
- Added `POST /api/sessions`: builds a due+new card queue (due = `next_review_at <= now`; new = `reps==0` not yet due, capped at 20), shuffles via `Random.shuffle`, inserts session row with `ended_at=null`, returns `{ sessionId, cards }`. 12 tests.
- Added `POST /api/attempts`: validates a batch of `{ cardId, correct, mode, response_time_ms }` items + `sessionId`; logs each as an `AttemptRow` with `{iso}_{uuid}` row key; runs SM-2 and upserts each card; 403 on cross-user session. 11 tests.
- Added `PUT /api/sessions/:id`: closes the session — sets `ended_at=now`, `duration_seconds`, `cards_studied`, `cards_correct`; 409 if already closed; 403 on cross-user. 9 tests.
- Added `StudySession.jsx` screen: fetches queue, card-flip UI (question → Show answer → reveal + grade buttons), retry pile for wrong cards, batches all attempts on completion then closes session and navigates to `/courses/:id/results` placeholder. 11 frontend tests; 3 new `api.js` wrappers (`startSession`, `postAttempts`, `closeSession`); "Study" link added to CourseList; EN + NL `study.*` i18n strings. Phase 8 complete — tag `phase-8-done`. See [PROGRESS.md](../PROGRESS.md).

## 2026-04-22 (Phase 7)

- Implemented Phase 7 — Manual cards (all 3 slices combined): `GET /api/cards?courseId=` (any authed user), `POST /api/cards` (course owner or admin, SM-2 defaults `ease=2.5, interval=0, reps=0, next_review_at=now`), `PUT /api/cards/:id?courseId=` and `DELETE /api/cards/:id?courseId=` (owner or admin); `CardManager` screen with card table, inline edit, add form (pipe-separated answer hint), delete with confirm, and read-only enforcement for non-owners (edit/delete buttons hidden + API 403 guard); "Manage cards" link added to CourseList; 4 new `api.js` wrappers + tests; EN + NL `cards.*` i18n strings; route `/courses/:courseId/cards` in `App.jsx`; 59 new tests; api 99.1% lines / 96.4% branches; frontend all thresholds met. Phase 7 complete — tag `phase-7-done`. See [plan](plans/done/phase-7-all-manual-cards.md).

## 2026-04-22

- Verified Phase 6 smoke: Lex creates/edits/deletes own course, Mats 403 on Lex's course, Waldo admin override, year `is_current` propagates. All five Design.md smoke items green against Azurite + `func start`. `/local-smoke` PASS (login, `/api/me`, wrong-password 401, SPA fallback). See [PROGRESS.md Phase 6](../PROGRESS.md).
- Wired composition root `api/src/index.ts` to register all 10 implemented Azure Functions (login, logout, me, users, users-public, users-id, years, years-id, courses, courses-id) with real `AzureTableStorage`, `HmacSessionSigner`, `BcryptPasswordHasher`, `SystemClock`, `SystemRandom`, and `SystemLogger` deps; previously only `/api/hello` was served by `func start`. Fixed pre-existing `exactOptionalPropertyTypes` TS error in `users-shared.ts` (conditional spread on optional `settings` field). Added `api/src/index.test.ts` (1 test, mocks `@azure/functions`, asserts all 11 route names registered). Phase 6 Slice 4. See [plan](plans/done/phase-6-slice-4-composition-root.md).
- Implemented Phase 6 — Years & Courses as one consolidated slice: `GET/POST /api/years` + `PUT /api/years/:id` (admin-only, `applyCurrentFlag` auto-unsets siblings); `GET/POST /api/courses` + `PUT/DELETE /api/courses/:id` (owner or admin, cross-partition scan for admin override, invariant 1 enforced — `user_id` from session only); `CourseList` screen with year-filtered course grid + new/edit/delete modal; Admin Panel extended with inline year table + create year form; Home screen gains "My courses" link for all authenticated users; `/courses` route added to `App.jsx`. 7 new api.js wrappers + tests. 140 frontend tests / 266 api tests; api 98.99% lines/97.08% branches; frontend 98% lines/89.69% functions. Phase 6 complete — tag `phase-6-done`. See [plan](plans/done/phase-6-consolidated-years-courses.md).
- Added Admin Panel frontend: `/admin` route guarded by a new `AdminRoute` component that fetches `/api/me` and redirects non-admins to `/home` (unauthenticated to `/`). `AdminPanel.jsx` lists users sorted by name, creates via the form, inline-edits name/emoji/color/admin/language, resets passwords via `window.prompt`, and deletes with a `window.confirm` — delete hidden for the admin's own row. Added 4 API wrappers (`fetchUsers`, `createUser`, `updateUser`, `deleteUser`) in `api.js`. Home screen now shows the Admin link only when `isAdmin`. EN + NL `admin.*` strings added. 38 new tests; frontend 99.65% lines / 96.15% functions. Phase 5 complete — tag `phase-5-done`. See [plan](plans/done/phase-5-slice-4-admin-panel.md).
- Added cascade-delete to `DELETE /api/users/{id}` — user-owned courses, cards, attempts, and sessions are wiped before the user row; other users' rows untouched; helper is idempotent. Committed Phase 5+ partition conventions in `api/src/shared/table-partitions.ts` (courses by user_id, cards by course_id, attempts/sessions by user_id) so Phases 6/7/8/9 inherit them. 9 helper tests + 2 integration tests; api 99.22% lines / 98.36% branches. Phase 5 Slice 3. See [plan](plans/done/phase-5-slice-3-cascade-delete.md).
- Added admin user CRUD: `POST /api/users` (admin) creates a user with bcrypt-hashed password via the `PasswordHasher` seam; `PUT /api/users/{id}` (admin) merges arbitrary fields and optionally rehashes the password; `DELETE /api/users/{id}` (admin) hard-deletes the row (cascade of child rows is Slice 3). Self-delete blocked with 403. Admin-only gate (403 for non-admins). Route-param-sourced id preserves invariant 1 — `auth-boundary` meta-test still green. Extracted `users-shared.ts` validators (`validateUserCreate`, `validateUserPatch`) shared with `users.ts` and `users-id.ts`. 40 new tests; api 99.18% lines / 98.32% branches. Phase 5 Slice 2. See [plan](plans/done/phase-5-slice-2-admin-user-crud.md).
- Added `GET /api/users` — authenticated endpoint returning all users as `{id, name, isAdmin, color, avatar_emoji, ui_language, settings, created_at}` sorted by name; `password_hash` never exposed; 401 for unauthenticated, 405 for non-GET. 10 tests, 100% lines / 100% branches on `users.ts`. Phase 5 Slice 1. See [plan](plans/done/phase-5-slice-1-get-users.md).
- Added Settings screen (`/settings`) with language toggle (EN/NL), `/settings` route in `App.jsx`, Settings link on Home screen, and `<html lang>` sync via `useEffect` in `AppProvider`. 100% frontend coverage, 9 new tests. Phase 4 Slice 3. See [plan](plans/done/phase-4-slice-3-settings-lang-toggle.md).
- Added `PATCH /api/me` — authenticated users can update their own
  `ui_language` and `settings` (shallow-merge). Validator rejects
  unknown ui_language (400), bad settings shapes (400), and ignores
  body attempts to mutate `userId` / `is_admin` / `name` /
  `password_hash` / `color` / `avatar_emoji` / `created_at`
  (invariant 1 regression guard). Method-dispatch on the `me`
  handler also returns 405 for other verbs. `password_hash` never
  leaves the handler. Frontend `patchMe()` wrapper + `AppProvider`
  `setLang` is now server-first (awaits PATCH, only updates local
  state on resolve). 51 frontend tests / 108 api tests / 100%
  frontend + 98.72% api lines. Phase 4 Slice 2. See
  [plan](plans/done/phase-4-slice-2-patch-me.md).
- Added i18n foundation — `frontend/src/i18n/strings.js` (EN + NL
  dictionary, ~27 keys), `translate()` helper with `{name}`
  placeholder interpolation and EN-fallback, `useT()` hook, and
  `AppContext` (holds `{user, lang, setLang, setUser}`; defaults
  `lang='en'`; no API call yet — Slice 2 wires PATCH /api/me).
  Rewired `UserPicker`, `Login`, `Home` through `t()`; all Phase 3
  screens render NL when wrapped in `<AppProvider initialLang="nl">`.
  46 frontend tests / 100% lines & branches on touched files. Phase 4
  Slice 1. See [plan](plans/done/phase-4-slice-1-i18n-foundation.md).
- Added `auth-boundary.test.ts` meta-test enforcing LexiQuest
  Invariant 1: no production handler under `api/src/functions/`
  reads `userId` from the request body. login.ts is the documented
  exemption (pre-session). Phase 3 complete. See
  [plan](plans/done/phase-3-slice-6-auth-boundary-meta.md).
- Frontend auth screens: `UserPicker`, `Login`, `Home` connected via
  `react-router-dom`. `src/lib/api.js` extended with
  `fetchPublicUsers`, `login`, `fetchMe`, `logout` (all fetch-DI'd,
  `credentials: include`). 22 frontend tests. 100% lines / 97.77%
  branches on touched files. Phase 3 Slice 5. See
  [plan](plans/done/phase-3-slice-5-frontend-auth.md).
- Added `GET /api/users/public` — anonymous picker endpoint returning
  `[{id, name, avatar_emoji, color}]` sorted by name; never leaks
  `password_hash` / `is_admin` / `settings` / `ui_language`. Phase 3
  Slice 4. See [plan](plans/done/phase-3-slice-4-users-public.md).
- Added `requireAuth` middleware, `POST /api/logout`, `GET /api/me`:
  `requireAuth` reads the cookie header (case-insensitive), verifies
  via the signer, returns `{userId, isAdmin}` or a 401 response.
  `/api/logout` always returns 204 with a cleared cookie. `/api/me`
  returns the full profile excluding `password_hash`, 404 on a stale
  session. 93 tests / 98% coverage. Phase 3 Slice 3. See
  [plan](plans/done/phase-3-slice-3-requireauth-me-logout.md).
- Added `POST /api/login` handler factory (DI'd over tables / hasher /
  signer / clock / logger). Returns 200 + user shape + HttpOnly
  session cookie on success; generic 401 on unknown-user or
  wrong-password (no which-one-was-wrong leak); 400 on missing body.
  Logs `login_success` / `login_failed` with `userId` only — never
  password or hash. Tier A 98% coverage. Phase 3 Slice 2. See
  [plan](plans/done/phase-3-slice-2-login.md).
- Added `SessionSigner` seam: `HmacSessionSigner` (HMAC-SHA256 +
  URL-safe base64, timingSafeEqual), `FakeSessionSigner`, shared
  contract suite (4 ACs: round-trip, tamper-rejection, malformed,
  expired). Refuses secrets <16 bytes. Phase 3 Slice 1. See
  [plan](plans/done/phase-3-slice-1-session-signer.md).
- Added Azurite-backed integration test
  (`api/src/shared/__integration__/azure-table-storage.integration.test.ts`):
  runs the shared TableStorage contract against real `@azure/data-tables`
  when `AZURITE_CONNECTION_STRING` is set, skips cleanly otherwise.
  docs/setup.md: added the Azurite boot guide. Phase 2 Slice 5. See
  [plan](plans/done/phase-2-slice-5-azurite.md). Phase 2 complete
  (pending Waldo's manual Azurite smoke + phase-2-done tag).
- Added idempotent seed (`api/src/shared/seed.ts` + `api/scripts/seed.ts`):
  creates 4 users (Waldo admin + Lex + Mats + Ben) with bcrypt hashes
  and the current school-year row from `Clock`-derived month/year.
  `SeedMissingPasswordError` with a redacted message. 7 tests / 100%
  coverage. Added `.env.example` documenting env contract. Phase 2
  Slice 4. See [plan](plans/done/phase-2-slice-4-seed.md).
- Added `Clock`, `Random`, `Logger` seams (real + fakes + unit
  tests). Logger type-rejects banned secret keys
  (password/hash/token/…). Phase 2 Slice 3. See
  [plan](plans/done/phase-2-slice-3-clock-random-logger.md).
- Introduced `PasswordHasher` seam: interface, `BcryptPasswordHasher`
  (bcryptjs, v8-ignored, contract-tested), `FakePasswordHasher`
  (deterministic salted), shared 4-AC contract run against both. Phase
  2 Slice 2. See [plan](plans/done/phase-2-slice-2-password-hasher.md).
- Introduced `TableStorage` seam: interface (`api/src/shared/table-storage.ts`),
  Map-backed fake (`api/testing/fake-table-storage.ts`), real Azure
  client (`azure-table-storage.ts`, integration-tested via Azurite in
  Phase 2 Slice 5), shared contract suite (`__contract__/`) with 8
  assertions run against the fake, and JSON-field helpers with 8 unit
  tests. Phase 2 Slice 1. See
  [plan](plans/done/phase-2-slice-1-table-storage.md).
- Filled out README.md, docs/setup.md, and docs/getting-started.md
  with local dev instructions, full-stack `swa start` command, and the
  Phase 1 manual smoke checklist. Phase 1 Slice 5 (docs-only). See
  [plan](plans/done/phase-1-slice-5-readme-localdev.md).
- `App` now fetches `/api/hello` on mount via `frontend/src/lib/api.js`
  (injected `fetch` seam) and renders the returned `msg`; shows
  "Loading…" during the request and falls back to "LexiQuest" on
  failure. Tier A coverage 100%. Phase 1 Slice 4. See
  [plan](plans/done/phase-1-slice-4-fetch-hello.md).
- Added `staticwebapp.config.json` (SPA fallback + `/api/*` passthrough)
  and the Azure Static Web Apps GitHub Actions deploy workflow; added
  `frontend/src/lib/swaConfig.js` helper with Tier A coverage. Phase 1
  Slice 3. See [plan](plans/done/phase-1-slice-3-swa-deploy.md). User
  action needed: provision the Azure SWA and add the
  `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret.
- Scaffolded `api/` (Azure Functions v4, Node 20, TypeScript) with Vitest
  Tier A (90%) thresholds; `hello` HTTP trigger returns
  `{msg:"Hello from LexiQuest"}`; coverage 100% on touched files. Phase 1
  Slice 2. See
  [plan](plans/done/phase-1-slice-2-api-scaffold.md).
- Scaffolded `frontend/` (Vite + React JS) with Vitest + Testing Library; `App`
  renders a LexiQuest heading; coverage 100% on touched files. Phase 1 Slice 1.
  See [PROGRESS.md](../PROGRESS.md) and
  [plan](plans/done/phase-1-slice-1-frontend-scaffold.md).
- Bootstrapped the TDD toolchain (CLAUDE.md, copilot-instructions,
  docs/tdd/**, .claude/skills/{tdd-cycle,security-scan,docs-update,local-smoke,deploy-swa},
  testing drop-ins). No application code yet. See [PROGRESS.md](../PROGRESS.md) Phase 0.
