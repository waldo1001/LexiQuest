# PROGRESS.md — LexiQuest

Where we are in the 17-phase plan from [Design.md §6](Design.md).

Each phase is independently shippable and ends with a tagged commit
(`phase-N-done`). Slices within a phase are TDD cycles; each slice gets
a plan file under [docs/plans/](docs/plans/) and is archived to
[docs/plans/done/](docs/plans/done/) when complete.

**Legend**: ⬜ not started · 🟡 in progress · ✅ done · ⏸ blocked

---

## Status summary

- **Current phase**: Post-v1 features (gaming mode + per-upload stats complete).
- **Last tag**: `phase-17-done`
- **Next up**: See [Design.md §7](Design.md) for deferred v2 items.

---

## Phase 0 — Toolchain (this repo before Phase 1 starts)

Not a Design.md phase. The TDD toolchain, skills, and drop-in configs
are set up so the first real TDD cycle (Phase 1, slice 1) can run
without inventing them from scratch.

- ✅ [CLAUDE.md](CLAUDE.md)
- ✅ [.github/copilot-instructions.md](.github/copilot-instructions.md)
- ✅ [docs/tdd/](docs/tdd/) — methodology, testability-patterns, ai-maintainability, coverage-policy
- ✅ [.claude/skills/](.claude/skills/) — tdd-cycle, security-scan, docs-update, local-smoke, deploy-swa
- ✅ [testing/](testing/) — Vitest configs, dev-dep manifests, fake examples
- ✅ [PROGRESS.md](PROGRESS.md) (this file)
- ✅ [.gitignore](.gitignore)
- ✅ [docs/changelog.md](docs/changelog.md) (empty header)
- ✅ [docs/setup.md](docs/setup.md) (placeholder, grows per phase)
- ✅ [docs/getting-started.md](docs/getting-started.md) (placeholder)
- ✅ [docs/user-guide.md](docs/user-guide.md) (placeholder)

---

## Phase 1 — Project skeleton & deployment pipeline

**Goal**: deployable empty shell. Visiting the URL shows "Hello from
LexiQuest" served from Azure. See
[Design.md Phase 1](Design.md#phase-1--project-skeleton--deployment-pipeline).

- ✅ Slice 1 — scaffold `frontend/` (Vite + React JS)
- ✅ Slice 2 — scaffold `api/` (Azure Functions TS) + `hello/` function
- ✅ Slice 3 — `staticwebapp.config.json` + GitHub Actions deploy workflow
- ✅ Slice 4 — wire `frontend` fetch of `/api/hello` + render the message
- ✅ Slice 5 — README, local-dev instructions, first `swa start` smoke

**Smoke test** (Design.md):
- [ ] Deployed URL shows "Hello from LexiQuest"
- [ ] Devtools confirms `/api/hello` returned JSON
- [ ] A commit to `main` auto-deploys within ~5 min
- [ ] `npm run dev` works locally
- [ ] `swa start` runs full stack locally

---

## Phase 2 — Storage layer & seed data

**Goal**: Table Storage provisioned; schema defined in code; seed script
populates 4 users + current year. See
[Design.md Phase 2](Design.md#phase-2--storage-layer--seed-data).

- ✅ Slice 1 — `TableStorage` seam (interface + real + fake + contract test)
- ✅ Slice 2 — `PasswordHasher` seam (interface + real + fake + contract test)
- ✅ Slice 3 — `Clock`, `Random`, `Logger` seams
- ✅ Slice 4 — `scripts/seed.ts` with the 4 users + current year
- ✅ Slice 5 — Azurite-backed integration smoke

---

## Phase 3 — Authentication

- ✅ Slice 1 — `SessionSigner` seam
- ✅ Slice 2 — `POST /api/login`
- ✅ Slice 3 — `requireAuth` middleware, `POST /api/logout`, `GET /api/me`
- ✅ Slice 4 — `GET /api/users/public`
- ✅ Slice 5 — Frontend: UserPicker, Login, Home screens
- ✅ Slice 6 — `api/__meta__/auth-boundary.test.ts` (invariant 1)

---

## Phase 4 — i18n foundation

- ✅ Slice 1 — `strings.js` + `useT` hook + AppContext
- ✅ Slice 2 — `PATCH /api/me` for `ui_language` + `settings`
- ✅ Slice 3 — Settings screen language toggle, `<html lang>` sync

---

## Phase 5 — Users & admin panel

- ✅ Slice 1 — `GET /api/users` (full shape, no hashes)
- ✅ Slice 2 — `POST`, `PUT`, `DELETE /api/users/:id` (admin)
- ✅ Slice 3 — Cascade-delete of user's courses/cards/attempts/sessions
- ✅ Slice 4 — Admin Panel screen + route guard

---

## Phase 6 — Years & Courses

- ✅ Slice 1 — `/api/years` CRUD (admin)
- ✅ Slice 2 — `/api/courses` CRUD (owner or admin)
- ✅ Slice 3 — Frontend CourseList + modal
- ✅ Slice 4 — Composition root wired (`api/src/index.ts`): all 10 functions registered with real deps; TS `exactOptionalPropertyTypes` fix in `users-shared.ts`

**Smoke test** (Design.md) — verified 2026-04-22 via `func start` + Azurite:
- ✅ Lex can create "French 🇫🇷" with language `fr-FR`
- ✅ Lex can edit/delete own course
- ✅ Lex cannot PUT/DELETE a course owned by Mats (403)
- ✅ Waldo CAN edit anyone's course (admin override)
- ✅ Current year propagates correctly (new courses linked to is_current year)

**`/local-smoke`** — verified 2026-04-22: Azurite boot, seed, login + HttpOnly cookie, `/api/me`, wrong-password 401, SPA fallback all PASS.

---

## Phase 7 — Manual cards

- ✅ Slice 1 — `/api/cards` CRUD with SM-2 defaults
- ✅ Slice 2 — `CardManager` screen
- ✅ Slice 3 — Read-only view for other users' cards

**Smoke test** (Design.md) — manual verification pending (run after push):
- [ ] Lex can add 10 cards to her French course
- [ ] Lex can edit/delete her own cards
- [ ] Lex viewing Mats's course cards: read-only (edit buttons hidden or 403 on attempt)
- [ ] Alternative-answer syntax stored verbatim (`le chien|le chiot`)
- [ ] New cards have correct SM-2 defaults and `next_review_at <= now`

---

## Phase 8 — SM-2 scheduling & self-grade session

- ✅ Slice 1 — `applySm2` pure function + RED list
- ✅ Slice 2 — Session queue builder (`POST /api/sessions`)
- ✅ Slice 3 — `POST /api/attempts` batch
- ✅ Slice 4 — `PUT /api/sessions/:id` (close)
- ✅ Slice 5 — `StudySession` screen self-grade flow

**Smoke test** (Design.md) — post-deploy UI verification pending:
- [ ] Lex starts a session with 10 cards (UI)
- [ ] Can flip, self-grade each (UI)
- [ ] Wrong cards appear again at the end (UI)
- [ ] After session, card SM-2 fields updated in storage (Storage Explorer)
- ✅ Failed cards have `reps=0, interval=1, next_review_at = tomorrow` — verified via `/local-smoke` 2026-04-22
- ✅ Correct cards have `reps=1, interval=1` (on first success) — verified via `/local-smoke` 2026-04-22

**`/local-smoke`** — PASS 2026-04-22 against Azurite + `func start`: queue built, attempts logged + SM-2 updated (correct reps=1/ease=2.60, wrong reps=0/ease=1.70), session closed with correct duration/counts. Azure Table Storage null→undefined bug found and fixed during smoke.

---

## Phase 9 — Attempts & sessions logging + results

- ✅ Slice 1 — Row-key format `{iso}_{uuid}` meta-test
- ✅ Slice 2 — `SessionResults` screen
- ✅ Slice 3 — `GET /api/stats/session/:id`

---

## Phase 10 — XP, streaks, daily goals, badges

- ✅ Slice 1 — `computeSessionXp` pure function
- ✅ Slice 2 — Streak logic with `Europe/Brussels` rollover + freeze tokens
- ✅ Slice 3 — Badge engine
- ✅ Slice 4 — `Dashboard` screen with streak/XP/progress

---

## Phase 11 — speechSynthesis / TTS

- ✅ Slice 1 — `Tts` seam (interface + real wrapping speechSynthesis + fake)
- ✅ Slice 2 — 🔊 buttons in study + card manager
- ✅ Slice 3 — `auto_speak` setting

---

## Phase 12 — Claude import

- ✅ Slice 1 — `ClaudeClient` seam + markdown-fence stripping + JSON parse
- ✅ Slice 2 — `POST /api/cards/import` (candidates only — invariant 3)
- ✅ Slice 3 — `POST /api/cards/batch` (after review)
- ✅ Slice 4 — `PhotoImport` + `ImportReview` screens

---

## Phase 13 — MCQ mode & enrich

- ✅ Slice 1 — `POST /api/cards/enrich`
- ✅ Slice 2 — MCQ rendering + grading in `StudySession`
- ✅ Slice 3 — Mode picker, mixed-mode dispatch

---

## Phase 14 — Stats API aggregation engine

- ✅ Slice 1 — `aggregate.ts` helpers (fetchAttempts, groupByDay, masteryBucket, …)
- ✅ Slice 2 — `/api/stats/user/:userId`
- ✅ Slice 3 — `/api/stats/course/:courseId` + struggle list
- ✅ Slice 4 — `/api/stats/family` and `/api/stats/compare`
- ✅ Slice 5 — `/api/stats/heatmap/:userId`
- ✅ Slice 6 — `api/__meta__/stats-privacy.test.ts` (invariant 2)

---

## Phase 15 — Stats UI & Family Dashboard

- ✅ Slice 1 — Recharts wrappers (LineOverTime, DailyBars, HourHistogram, …)
- ✅ Slice 2 — `CalendarHeatmap`
- ✅ Slice 3 — `FamilyDashboard` screen
- ✅ Slice 4 — `UserStats` screen
- ✅ Slice 5 — `CourseStats` screen

---

## Phase 16 — Leaderboard & Compare view

- ✅ Slice 1 — `GET /api/leaderboard`
- ✅ Slice 2 — `Leaderboard` screen
- ✅ Slice 3 — `CompareView` screen

---

## Phase 17 — PWA polish, settings, backup/export

- ✅ Slice 1 — PWA manifest + service worker (shell-only caching)
- ✅ Slice 2 — Settings screen completion (daily_goal, preferred_mode, freezes)
- ✅ Slice 3 — `GET /api/export` + download button
- ✅ Slice 4 — Mobile UX polish (bottom nav, swipe gestures, tap targets, dark mode)
- ✅ Slice 5 — Final error-handling pass (banners, offline detection)

---

## Phase 18 — Bidirectional cards

- ✅ Slice 1 — Schema + pure reverse builder (`reverse_of`, `CardSource="reverse"`, `buildReverseCard`)
- ✅ Slice 2 — `POST /api/cards/reverse` + Card Manager button
- ✅ Slice 3 — Bidirectional toggle on Import Review
- ✅ Slice 4 — Course-level `bidirectional` default
- ✅ Slice 5 — Card Manager pairing UI + linked delete

---

## Post-v1 — Gaming mode (session length + game types)

- ✅ Slice 1 — Priority scoring module (`card-priority.ts`: `scoreCard`, `buildQueue` Classic)
- ✅ Slice 2 — Game type data model + validation (`sessions-shared.ts`)
- ✅ Slice 3 — Game-type queue builders (boss_round, speed_round, review_blitz)
- ✅ Slice 4 — Wire priority into session creation (`sessions.ts`)
- ✅ Slice 5 — XP multipliers + Boss Round badge
- ✅ Slice 6 — Frontend API client update (`api.js`)
- ✅ Slice 7 — SessionSetup screen
- ✅ Slice 8 — Speed Round timer in StudySession
- ✅ Slice 9 — Game type in SessionResults
- ✅ Slice 10 — Integration + edge cases

**`/local-smoke`** — PASS 2026-04-25: Azurite boot, seed, login + HttpOnly cookie, `/api/me`, wrong-password 401, SPA fallback all PASS. AI import probe skipped (no ANTHROPIC_API_KEY).

See [docs/plans/done/gaming-mode.md](docs/plans/done/gaming-mode.md).

---

## Post-v1 — Per-upload stats

- ✅ Slice 1 — API handler `stats-upload.ts` (17 tests, 91%+ coverage)
- ✅ Slice 2 — Privacy meta-test in `stats-privacy.test.ts`
- ✅ Slice 3 — Frontend API wrapper + i18n (4 tests, 16 i18n keys EN+NL)
- ✅ Slice 4 — `UploadStats.jsx` screen + routing + CardManager link (11 tests)

---

## Post-v1 — Deployment runbook + live→dev snapshot

Plan: [docs/plans/done/deployment-and-live-to-dev-snapshot.md](docs/plans/done/deployment-and-live-to-dev-snapshot.md)

- ✅ Slice 1 — `connection-string-guard` helper (6 tests, 100% coverage)
- ✅ Slice 2 — `snapshot-payload` builder (6 tests, 100% coverage)
- ✅ Slice 3 — `export-all` script + npm wiring + `.gitignore` (v8-ignored, integration-verified against Azurite)
- ✅ Slice 4 — `import-local` script + npm wiring (v8-ignored, safety-latched via Slice 1, idempotent against Azurite)
- ✅ Slice 5 — `docs/deployment.md` runbook (links from `setup.md`)
- ✅ Slice 6 — Pre-public-GitHub safety gate (run + documented in changelog; pre-existing `npm audit` highs in `frontend/` dev-deps surfaced as a separate follow-up)

---

## Post-v1 — Seed roster: add Kaat & Amaryllis

Plan: [docs/plans/seed-users-kaat-amaryllis.md](docs/plans/seed-users-kaat-amaryllis.md)

- ✅ `SEED_USERS` extended with Kaat (`#f59e0b`, 🐰) and Amaryllis (`#ec4899`, 🌸); Waldo remains the lone admin
- ✅ Tests: 4 new tests in `seed.test.ts` (10 total) covering full roster + per-user spec assertions; 100% coverage on `seed.ts`
- ✅ Docs: `docs/setup.md`, `docs/getting-started.md`, `docs/deployment.md` (§1c/§1d/§1e), `README.md`, `.env.example`, local-smoke skill — all six users (Waldo + 5 students) listed and shown on the picker

**Follow-up (2026-04-27)**: the original plan also filtered admin
users out of `GET /api/users/public` so Waldo would not appear in the
student picker. Reverted by user decision — Waldo stays in the picker
alongside the five students. Filter removed; tests and docs updated to
match.

---

## Post-v1 — Local-dev password recovery (`reset-password` script)

Plan: [docs/plans/i-can-t-log-into-mighty-eagle.md](docs/plans/i-can-t-log-into-mighty-eagle.md)

- ✅ `api/src/shared/reset-password.ts` — single + bulk; `UserNotFoundError`, `MissingPasswordError`, `BulkNoOpError`
- ✅ Tests: 11 new tests in `reset-password.test.ts`; 100% line/branch/fn coverage on `reset-password.ts`
- ✅ Runner: `api/scripts/reset-password.ts` — `/* v8 ignore */`; Azurite-only via `isAzuriteConnectionString`; argv `--name/--password` + `RESET_PASSWORD` env; bulk reads `PASSWORD_<NAME>` env vars (mirrors seed)
- ✅ Wired as `npm run reset-password` in `api/package.json`

---

## Post-v1 — Online-only PWA (Android-installable home-screen icon)

Plan: [docs/plans/done/pwa-online-only.md](docs/plans/done/pwa-online-only.md) (also covers Waldo image avatar via [done/waldo-image-avatar.md](docs/plans/done/waldo-image-avatar.md))

- ✅ Slice 1 — PWA online-only
  - Tests: PWA-9..12 (manifest icons resolve, split any/maskable, apple-touch-icon, SWA fallback exclusions); PWA-B1..B3 (build-output smoke: manifest, sw.js, valid 192/512 PNGs)
  - Source icon: `frontend/scripts/icon-source/waldo.png` (copied from waldo.BCTelemetryBuddy)
  - Generator: `frontend/scripts/generate-icons.mjs` (sharp), wired as `npm run icons`
  - Outputs: `public/icons/icon-{192,512}.png` (any) + `icon-{192,512}-maskable.png` (white bg, 80% safe zone)
  - `manifest.json` split into 4 entries (any + maskable purposes)
  - `index.html`: added `<link rel="apple-touch-icon" href="/icons/icon-192.png">`
  - `staticwebapp.config.json`: added `/icons/*`, `/manifest.json`, `/*.webmanifest` to navigationFallback exclude
  - Full suite: 529 passing

- ✅ Slice 2 — Waldo image avatar
  - Schema: `UserRow.avatar_image_url?: string`; Waldo's seed spec set to `/icons/icon-192.png`
  - Validation: `^/icons/[a-z0-9-]+\.(png|webp)$` regex; rejects external URLs, `javascript:`, path traversal; null clears the field
  - Projection: `/api/users/public` returns `avatar_image_url` (nullable); `fullProfile` includes it
  - PUT `/api/users/:id` updates and clears the field; `delete merged.avatar_image_url` on null patch
  - Frontend: new `<Avatar>` component renders `<img>` (with explicit width/height) when `avatar_image_url` is a non-empty string, else emoji span
  - `UserPicker` switched to `<Avatar>` so all picker tiles render through the same path
  - Tests: AVATAR-1..16 across `seed.test.ts`, `users-public.test.ts`, `users-shared.test.ts`, `users-id.test.ts`, `Avatar.test.jsx`, `UserPicker.test.jsx`
  - Full suites: 809 api + 535 frontend = 1344 tests passing
  - Security scan PASS
  - Migration: existing Waldo row needs a manual `PUT /api/users/<waldoId>` (or admin UI) to set the new field — seed only populates it for new rows

---

## Post-v1 — Add cards to an existing upload (manual + import)

Plan: [docs/plans/done/post-v1-add-to-existing-upload.md](docs/plans/done/post-v1-add-to-existing-upload.md)

- ✅ Slice A — Manual add into existing upload
  - API: `findExistingUpload(tables, courseId, uploadId)` helper in `cards-shared.ts` (course-scoped); `validateCardCreate` accepts optional `upload_id`; `POST /api/cards` looks up the upload, stamps both `upload_id` and inherited `upload_name`, returns 400 if the upload doesn't belong to the course
  - Frontend: `CardManager` New-card form gains an "Add to" `<select>` (default *Manual*, plus each existing upload); per-upload ➕ icon button opens the form pre-targeted to that upload; new card auto-expands its destination group
  - i18n: `cards.field.addTo`, `cards.option.upload`, `cards.action.addToUpload` (en/nl)
  - Tests: 7 new in `cards-shared.test.ts` (findExistingUpload), 6 new in `cards.test.ts` (POST upload_id matrix incl. bidirectional inheritance + cross-course rejection), 6 new in `CardManager.test.jsx` (CMA-1..6); full suite green

- ✅ Slice B — Import-into-existing-upload + first-class PDF
  - API: `POST /api/cards/batch` accepts optional `uploadId` (mutually exclusive with `uploadName`); validates the upload exists in this course; reuses its identity (id + inherited `upload_name`) instead of minting a new one; bidirectional reverses inherit the same upload identity
  - Frontend: `PhotoImport` calls `fetchCards` on mount and renders an "Add to upload" `<select>` (New upload + each existing upload). Pre-selects via `state.uploadId`. Carries `uploadId`/`uploadName` to Review through navigation state.
  - `ImportReview`: when `uploadId` is in state, hides the "Name this upload" input, shows "Adding cards to: {name}", and submits `uploadId` (not `uploadName`).
  - `CardManager`: per-upload 📷 "Import here" link navigates to `/import` with `state.uploadId` so the importer pre-selects that upload.
  - PDF: end-to-end propagation of `application/pdf` mime is now covered by an explicit FE test (PI-B3); backend/Claude seam was already PDF-capable via `document` blocks.
  - i18n: `import.addToUpload`, `import.newUpload`, `review.appendingTo`, `cards.action.importHere` (en/nl)
  - Tests: 6 new in `cards-batch.test.ts` (SB-1..6), 5 new in `PhotoImport.test.jsx` (PI-B1..5), 3 new in `ImportReview.test.jsx` (IR-B1..3), 1 new in `CardManager.test.jsx` (CMA-7). Full suites: 830 api + 550 frontend = 1380 passing.

---

## Post-v1 — Cards-import diagnostic logging

Plan: [~/.claude/plans/test-the-import-feature-hashed-hartmanis.md](../.claude/plans/test-the-import-feature-hashed-hartmanis.md)

- ✅ Slice 1 — Diagnostic logging in cards-import 502 catch
  - API: `CardsImportDeps` gains `logger: Logger`; the catch-all in `cards-import.ts` now emits a single structured `cards_import_claude_failed` line with `userId`, `courseId`, `mimeType`, `payloadKB`, `errorName`, `errorMessage`, and SDK-supplied `status` before returning 502 — turns the opaque "Claude is unavailable" 502 into a diagnosable event without changing the user-facing response
  - Composition root (`index.ts`): wires `logger` into `registerCardsImport`; also adds an `anthropic_api_key_missing` startup-error log when `ANTHROPIC_API_KEY` is empty/whitespace
  - Security: typed `LogAttrs` already bans `password`, `apiKey`, `imageBase64`, etc. by key name; the new line carries no secrets, no base64, no session token
  - Tests: 3 new in `cards-import.test.ts` (AC24 — 502 path logs the full attr set incl. SDK status; AC25 — 200 path emits no failure log; AC26 — 422 ClaudeJsonParseError emits no failure log). Full api suite 833 passing
  - Cards-import.ts coverage: 100% statements / 96.36% branches (Tier-A floor 90%)
  - **Diagnostic outcome**: live image-import failure was a 5.46 MB photo exceeding Anthropic's 5 MB / 5,242,880 bytes per-image cap → 400 BadRequestError from the SDK was being miscategorised as "Claude unavailable" (502)

- ✅ Slice 2 — Pre-Claude size guard returns 413 with clear UI message
  - API: `cards-import.ts` enforces decoded-payload caps **before** calling Claude — 5 MB for images, 32 MB for PDFs (Anthropic per-image / per-document limits). On overrun returns `413 { error, maxBytes, actualBytes }`. Saves a Claude round-trip and stops mis-attributing client-side mistakes to upstream availability
  - Frontend: `importCards` in `api.js` maps `413` → `Error("image_too_large")`; `PhotoImport.jsx` adds the new branch that renders `import.error.tooLarge`; i18n: `"That photo is too large (max 5 MB)…"` (en) / `"Die foto is te groot (max 5 MB)…"` (nl)
  - Tests: 4 new in `cards-import.test.ts` (AC27 413 + maxBytes/actualBytes shape; AC28 413 path doesn't call Claude; AC29 413 doesn't emit `cards_import_claude_failed`; AC30 PDF up to 32 MB still passes). 1 new in `api.test.js` (413 → image_too_large). 1 new in `PhotoImport.test.jsx` (image_too_large → tooLarge string). Suites: 837 api + 552 frontend = 1389 passing
  - Coverage: cards-import.ts 100%/96.61%, api.js 97.71%, PhotoImport.jsx 98.77%, strings.js 100% — all above tier floors
  - **Decided against** client-side auto-downscale this slice: canvas/image manipulation is hard to TDD reliably in jsdom, the user-facing message is honest and self-resolvable (re-take the photo, or use the phone's lower-resolution mode). Revisit only if oversized photos remain a routine pain point

- ✅ Slice 3 — Size-guard math fix: compare base64 length, not decoded bytes
  - Bug: Slice 2's guard compared `imageBase64.length × 3 / 4` (decoded image bytes) against the 5 MB cap. Live retry showed Anthropic actually enforces the cap against the **base64 string length itself** — a 5.46 MB photo arrives as 5.72 M base64 chars (decodes to 4.3 MB), passes our decoded-bytes check, and is then rejected by the SDK. The user noticed and added a `errorMessage.includes("image exceeds") → 413` fallback inside the catch block as a workaround
  - Fix: compare `imageBase64.length` directly to the cap. Renamed constants `MAX_IMAGE_DECODED_BYTES` → `MAX_IMAGE_PAYLOAD_BYTES` (and PDF equivalent) to reflect the actual semantic. The catch-block fallback stays as belt-and-braces for any edge case that slips through
  - Tests: AC31 (new) — regression for the user's exact scenario (5.725 M chars, decoded < 5 MB, base64 > 5 MB → 413). Updated AC27/AC30 comments. Suites: 839 api passing
  - Cards-import.ts coverage: 100% / 96.77%

## Post-v1 — Save partial study sessions

Plan: [/Users/waldo/.claude/plans/when-any-does-a-robust-mountain.md](/Users/waldo/.claude/plans/when-any-does-a-robust-mountain.md)

- ✅ Slice 1 — Save what the user answered when a session is left mid-flight
  - Bug: `StudySession.jsx` only called `postAttempts` + `closeSession` once the queue and retry pile drained (or the speed-round timer expired). Closing the tab, navigating away, or just wanting to stop after 5 of 20 cards lost every grade — no SM-2 update, no XP, no streak credit, and the session row stayed open in storage with `ended_at = null`
  - Fix: 3 frontend-only changes
    1. New "End now" button in the study-progress bar (hidden in `speed_round`, which already self-finishes on its 60-second timer). Click → `window.confirm` → reducer dispatches `END_EARLY` → existing `FINISHING` flow runs with the partial counts, navigating to results. Zero-attempts End Now skips confirm and routes back to `/courses`
    2. Auto-flush effect: `pagehide` listener + unmount cleanup re-use `postAttempts`/`closeSession` with `keepalive: true` (extended both wrappers in `api.js` to forward the option). A `flushRef` guards against double-save when `finishSession` and the cleanup race
    3. Partial-count fix: `cardsStudied` now derives from `Object.keys(firstTryResults).length` (actually-answered) rather than `state.totalUnique` (planned). No-op for full sessions; correct for partial
  - i18n: 3 new keys EN+NL (`study.endNow`, `study.endNowAria`, `study.endNowConfirm`)
  - Tests: 9 new in `StudySession.test.jsx` (PS-1 to PS-9 — button visibility, partial save, zero-answer back-out, confirm-cancel, unmount flush, pagehide flush, no double-save). Suites: 571 frontend + 844 api passing
  - Coverage: `StudySession.jsx` 93.78% lines / 71.42% functions (Tier B 70% met; was 69.23% before this slice). `api.js` 97.72% lines (Tier A 90% met)
  - Backend untouched — `sessions-id.ts` already handled any `cards_studied >= 0`, so XP/streak/badges work for partial sessions automatically

## Post-v1 — Picker in main menu

Plan: [/Users/waldo/.claude/plans/i-want-the-picker-zany-beacon.md](/Users/waldo/.claude/plans/i-want-the-picker-zany-beacon.md)

- ✅ Slice 1 — Add User Picker as 5th bottom-nav item
  - Need: once signed in, the only way back to the user picker (`/`) was to edit the URL or clear the session — awkward on a shared family device
  - Fix: append `{ to: "/", labelKey: "nav.picker", icon: "👥" }` to `LINKS` in `BottomNav.jsx`; new `nav.picker` translation in en (`Users`) + nl (`Gebruikers`). Position: rightmost, after Settings
  - Tests: 1 new in `BottomNav.test.jsx` (BN-8 — link to `/` with name /users/i). Suites: 572 frontend passing
  - Coverage: `BottomNav.jsx` 100% all metrics (Tier B 70% met)

## Post-v1 — Copy upload cards

Plan: [/Users/waldo/.claude/plans/i-want-to-be-cosmic-goose.md](/Users/waldo/.claude/plans/i-want-to-be-cosmic-goose.md)

- ✅ Slice 1 — Copy all forward cards from one upload to another (same course), skipping duplicate questions
  - Need: re-organising or merging uploads required deleting + re-importing or hand-copying cards. Same applies when the user wants to seed a new pack from an old one without losing the SM-2 progress on the original
  - API: new `POST /api/cards/copy` (`cards-copy.ts`) — body `{ courseId, sourceUploadId, targetUploadId }`, returns `{ copied, skipped, copied_card_ids }`. Reuses `findExistingUpload` (course-scoped); copies non-reverse forwards only (reverses are derived — user re-runs `cards-reverse` on the target if wanted); SM-2 fields reset to defaults; `created_at`/`next_review_at` set to now; target upload's `upload_name` inherited; `source` preserved. Dedup is `q.trim().toLowerCase().replace(/\s+/g, " ")` scoped to the **target upload only** (other uploads in the same course can keep duplicates), and dedups within the source itself
  - Frontend: new `copyUploadCards` in `api.js`; `CardManager.jsx` adds 📋 button per upload group (testid `upload-copy-${uploadId}`) + inline `copy-row` mirroring the existing `rename-row` pattern. Button is disabled when no other uploads exist. Status banner shows "{copied} copied, {skipped} skipped"; cards refetch on success
  - i18n: `cards.action.copyToUpload`, `cards.action.copy`, `cards.action.copyTargetLabel`, `cards.status.copied` (en + nl)
  - Tests: 29 new in `cards-copy.test.ts` (auth, validation, course/upload not-found, ownership, copy semantics, SM-2 reset, dedup variants — case/whitespace/answer-ignored/target-scoped/within-source, reverse-skip, admin override, no-mutation), 3 in `api.test.js` (copyUploadCards), 7 + 2 in `CardManager.test.jsx` (CC-1..7 copy, CR-1..2 rename — opportunistically lifted CardManager function-coverage from a pre-existing 65% to 80%). Suites: 876 api + 584 frontend = 1460 passing
  - Coverage: `cards-copy.ts` 100% all metrics (Tier A 90% met). `api.js` 97.77% lines / 97.36% functions (Tier A). `CardManager.jsx` 95.35% lines / 80% functions (Tier B 70% met). Auth-boundary meta-test still passes (invariant #1)
  - Out of scope: cross-course copy, copying selected cards only, creating a new target upload from the copy flow, copying reverses verbatim with id-remapping (regenerate them on the target instead)

## Post-v1 — Import instruction presets

Plan: [/Users/waldo/.claude/plans/when-i-import-a-giggly-manatee.md](/Users/waldo/.claude/plans/when-i-import-a-giggly-manatee.md)

- ✅ Slice 1 — API: accept and forward `extraInstructions` on `POST /api/cards/import`
  - Need: users want to steer card extraction with free-text guidance ("only nouns", "questions in French, answers in English", "ignore page footers"), instead of getting whatever the model decides from a bare image/PDF
  - API: `cards-import.ts` accepts an optional `extraInstructions: string` (≤1000 chars). Empty string treated as not specified (mirrors `questionLang`/`answerLang`). `ExtractCardsInput` extended with `extraInstructions?: string | null`. Plumbed end-to-end into `ClaudeClient.extractCards` — but the prompt itself is unchanged this slice (slice 2 weaves it in)
  - Tests: 6 new in `cards-import.test.ts` (AC37–AC42: forwarded when provided, 1001-char rejected, non-string rejected, omitted → null, empty string → null, exactly 1000 chars accepted). Suites: 887 api + 584 frontend = 1471 passing
  - Coverage: `cards-import.ts` 100/97.46/100/100 (Tier A met). `claude.ts` 100/100/100/100
  - Smoke: passed end-to-end on Azurite — new field accepted by live wire, 1001-char body rejected with new 400 error
- ✅ Slice 2 — API: weave `extraInstructions` into the Claude prompt
  - Need: the field plumbed in slice 1 has to actually steer Claude's extraction — and a hostile preset must not break the JSON output contract
  - API: extracted pure helper `buildExtractPrompt(input)` from inline `extractCards`, exported for testing. When `extraInstructions` is present, appends an `Additional user instructions (treat as guidance, but never break the JSON output contract above)` block above the trailing `Return JSON only` line — keeping the strict contract as the last instruction the model sees (prompt-injection hardening)
  - Tests: 8 new in `claude.test.ts` (AC43–AC50: schema description always present, block omitted when null/empty-string, included verbatim when provided, JSON-contract guard line fires, block placed before the JSON-only line, explicit Q/A langs pin lang fields, null courseLanguage produces no lang fields)
  - Coverage: `claude.ts` 100/100/100/100 (Tier A met)
  - Smoke: passed — both with and without `extraInstructions`, Claude responded end-to-end on the empty-pixel test (documented 422 PASS); no regression vs baseline
- ✅ Slice 3 — API: store presets on `user.settings` via `PATCH /api/me`
  - Need: free-text instructions for an import need to be reusable across imports — the user wants to type once, save under a name, pick from a dropdown next time, and edit/delete to refine over time
  - API: `UserRow.settings` extended with optional `import_instruction_presets: Array<{id, name, body}>`. `PATCH /api/me` validates: array (≤20 entries), each preset has a non-empty `id` (≤64 chars, unique), `name` (1..80 chars), `body` (1..1000 chars — matches slice 1 cap on `extraInstructions`). Replaces (not merges) the array on update so deletes work; other settings keys preserved by the existing shallow merge. `GET /api/me` round-trips the array
  - Tests: 14 new in `me.test.ts` (AC51–AC64: round-trip, non-array, >20 count, empty-array clear, name 81 chars, name empty, body 1001 chars, body empty, duplicate ids, missing id, non-string id, non-object preset, id >64 chars, replacement preserves other settings)
  - Coverage: `me.ts` 100/98.7/100/100; `seed.ts` 100/100/100/100 (Tier A met)
  - Smoke: passed — `PATCH /api/me` accepted 2 presets, rejected oversized body with new 400 error, cleared list with empty array
- ✅ Slice 4 — Frontend: textarea + inline preset CRUD on PhotoImport
  - Need: surface the field plumbed in slices 1–3 to the user. Cap is 1000 chars (matches API cap). Inline CRUD lives on the import page (no separate Settings section, no new route) per the user's chosen scope
  - Frontend: `PhotoImport.jsx` gets an `<textarea maxLength=1000>` for free-text steering, plus a "Use saved instructions" `<select>` (rendered only when presets exist), and three buttons — Save as new, Update, Delete. Mirrors the `AdminPanel.jsx` injection pattern: `patchMe`, `promptFn`, `confirmFn` props (real `window.prompt` / `window.confirm` defaults; tests inject mocks). Submitting an import sends `extraInstructions` (trimmed) only when non-empty. Save/Update/Delete call `patchMe({ settings: { import_instruction_presets: nextArray }})` and update the AppContext `user`. Selecting a preset prefills the textarea. Caps enforced client-side too: empty body → inline error, 21st preset → inline error, no PATCH fired
  - i18n: 11 new keys (en + nl) under `import.extraInstructions*` and `import.preset.*`
  - Tests: 13 new in `PhotoImport.test.jsx` (AC65–AC77: textarea + maxLength, payload includes/omits `extraInstructions`, dropdown rendered conditionally, preset selection prefills, Save-as-new happy path, empty-body error, 20-cap error, Update disabled without selection, Update body-replace, Delete with confirmation, prompt-cancel aborts). Suites: 901 api + 597 frontend = 1498 passing
  - Coverage: `PhotoImport.jsx` 96.89/83.96/100/96.89 (Tier B 70% lines/functions/statements met). `api.js` 97.77/97.05/97.36/97.77 (Tier A met). `AppContext.jsx` 100/93.1/100/100. `strings.js` 100/100/100/100
  - Smoke: passed — preset round-trip via PATCH /api/me persisted, import path with `extraInstructions` reached Claude end-to-end, frontend production build succeeded
