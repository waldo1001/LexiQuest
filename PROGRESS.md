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

Plan: [docs/plans/deployment-and-live-to-dev-snapshot.md](docs/plans/deployment-and-live-to-dev-snapshot.md)

- ✅ Slice 1 — `connection-string-guard` helper (6 tests, 100% coverage)
- ✅ Slice 2 — `snapshot-payload` builder (6 tests, 100% coverage)
- ✅ Slice 3 — `export-all` script + npm wiring + `.gitignore` (v8-ignored, integration-verified against Azurite)
- ✅ Slice 4 — `import-local` script + npm wiring (v8-ignored, safety-latched via Slice 1, idempotent against Azurite)
- ⬜ Slice 5 — `docs/deployment.md` runbook
- ⬜ Slice 6 — Pre-public-GitHub safety gate
