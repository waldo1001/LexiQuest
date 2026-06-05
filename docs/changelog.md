# Changelog — LexiQuest

Reverse chronological. Newest date first. One line per change, past tense,
plain English. Link the most relevant doc or plan.

## 2026-06-05

- Deployed `71f637f` (card order option) to Azure SWA. GH Actions [run 27037428439](https://github.com/waldo1001/LexiQuest/actions/runs/27037428439) green in 1m40s. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 `{msg}`; `/api/users/public` 9 users, no `password_hash`/`settings`/`is_admin` leak (invariant #4 holds); SPA root serves index. Pre-deploy `/local-smoke` PASS incl. the new `/api/sessions` cardOrder path (sequential → deck order, invalid → 400).
- Added a **card-order** option to Session Setup: questions stay **random** by default, with a new **In order** choice that presents Classic-study cards in deck order (`created_at` ascending, tie-broken by card id) instead of shuffled. Threaded through `POST /api/sessions` validation, `QueueOptions`/`buildQueue` (Classic only — the challenge game types keep their deliberate order), and persisted as `card_order` on the session row (legacy rows default to `random`). New Random / In order picker in `SessionSetup`; `StudySession` forwards `cardOrder` only when sequential. 13 new tests (`card-priority.test.ts`, `sessions-shared.test.ts`, `sessions.test.ts`, `SessionSetup.test.jsx`, `StudySession.test.jsx`); 934 api + 645 frontend pass; `card-priority.ts` 100% / `sessions.ts` 95% / `sessions-shared.ts` 100% (Tier A), `SessionSetup.jsx` 96.8% / `StudySession.jsx` 93.8% / `strings.js` 100% (Tier B). See [user-guide.md](user-guide.md) (Studying → Card order). Plan: [plans/done/post-v1-card-order.md](plans/done/post-v1-card-order.md).

## 2026-06-04

- Deployed `fc5eb89` (Modern Greek `el` language + PDF re-split-on-timeout retry) to Azure SWA. GH Actions [run 26951156812](https://github.com/waldo1001/LexiQuest/actions/runs/26951156812) green in 1m43s. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 `{msg}`; `/api/users/public` clean (no `password_hash`/`session`/`is_admin` — invariant #4 holds).
- Added **Modern Greek (`el`)** as a first-class language. It now appears as a course language (`el-GR`) and in both import side-language pickers (labelled "Greek"/"Grieks"), mirroring the earlier Latin/Ancient-Greek addition. This fixes the gap where a Modern-Greek textbook could only be tagged as `grc` (Ancient Greek), a different language. Unlike Latin/Ancient Greek, the 🔊 audio button works for Modern Greek because browsers ship a Greek TTS voice (existing `tts.js` prefix match on `el`). Frontend-only — the backend BCP-47 validator already accepted `el`. 4 new tests (`CourseList.test.jsx`, `PhotoImport.test.jsx`); 640 frontend pass; `CourseList.jsx` 98.74% / `PhotoImport.jsx` 97.53% lines / `strings.js` 100% (thresholds met). Plan: [plans/done/post-v1-modern-greek-language.md](plans/done/post-v1-modern-greek-language.md).

## 2026-05-22

- Added **adaptive re-split-on-timeout retry** for PDF import (Slice 3 of the chunked-import plan). When a PDF batch fails with a non-terminal error (e.g. a 45s gateway timeout on a page dense enough to exceed the cap even on Haiku), `PhotoImport.jsx` re-splits that batch into single pages and retries each, merging the candidates; bottoms out at 1 page so there's no retry storm, and terminal errors (parse/claude/too-large/forbidden) still surface immediately. 2 new tests (AC13/AC14 in `PhotoImport.test.jsx`); 636 frontend pass; `PhotoImport.jsx` 97.52% lines / 100% funcs (Tier B). Frontend-only, no new deps. Plan: [plans/done/post-v1-pdf-chunked-import.md](plans/done/post-v1-pdf-chunked-import.md).
- Deployed `ec9162c` (PDF chunked import + Haiku) to Azure SWA. GH Actions [run 26306292246](https://github.com/waldo1001/LexiQuest/actions/runs/26306292246) green in 1m38s. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 `{msg}`; `/api/users/public` 9 users, no `password_hash`/`settings`/`is_admin` leak (invariant #4 holds); `/api/me` unauth → 401; SPA root serves index. Pre-deploy `/local-smoke` PASS incl. real-PDF probe (200, 19 candidates, 25s via Haiku).
- Fixed **PDF import failing with "Something went wrong"** on large/multi-page PDFs. Root cause (reproduced): a single Sonnet PDF extraction call took ~62s, exceeding the Azure Static Web Apps **hard 45s per-API-request cap** ([docs](https://learn.microsoft.com/azure/static-web-apps/apis-overview#api-constraints)); the gateway killed the request and the resulting status fell outside the set `frontend/src/lib/api.js` maps, so `PhotoImport.jsx` showed the generic error. Smoke-testing on the user's real file showed latency is **output-bound** (cards generated), not page-bound — so page-chunking alone wasn't enough (a small 8-page batch still took 62s; even 4 pages hit 46s).
- Fix, two parts (managed-functions, no infra change): (1) **client-side PDF page chunking** — new `frontend/src/lib/pdf-chunk.js` (`splitPdfBase64`, `PAGES_PER_BATCH=4`, lazy-loaded `pdf-lib`) splits a PDF into small page batches; `PhotoImport.jsx` sends each as its own `/api/cards/import` request, shows an "Extracting part N of M…" progress notice, and merges candidates into Import Review (invariant 3 preserved). (2) **faster model for PDF extraction** — `extractCards` gained an optional `model`; the handler passes Haiku (`claude-haiku-4-5-20251001`) for `application/pdf` while images/pptx stay on Sonnet. Smoke-validated on the real file: every batch ran 6.4–12.2s (slowest 12.2s, no truncation) — a ~3.7× margin under 45s.
- Tests: 12 frontend (5 in `pdf-chunk.test.js`, 7 in `PhotoImport.test.jsx`) + 2 api (`cards-import.test.ts` AC90/AC91 model selection). Suites: 927 api + 634 frontend pass. Coverage: `pdf-chunk.js` 100/91.66/100/100, `PhotoImport.jsx` 97.4 lines, `claude.ts` 100, `cards-import.ts` 99.03 — all above tier floors. 2 new i18n keys per locale (`import.progress`, `import.error.pdfRead`). New dep `pdf-lib` (frontend; zero npm-audit advisories). Adaptive re-split-on-timeout retry deferred (Haiku margin makes it low-value). Bring-your-own Azure Functions noted as the permanent fix to remove the 45s cap. Plan: [plans/done/post-v1-pdf-chunked-import.md](plans/done/post-v1-pdf-chunked-import.md).

## 2026-05-02

- Deployed `66030af` (Latin & Ancient Greek language picker) to Azure SWA. GH Actions [run 25247363374](https://github.com/waldo1001/LexiQuest/actions/runs/25247363374) green in 1m30s. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 with expected msg; `/api/users/public` returns 9 users with no `password_hash`/`settings`/`is_admin` leaks (invariant #4 holds); `/` serves index.html SPA root; `/api/me` unauth → 401. Frontend-only slice — no new API route to probe — bundle landing confirms the extended `LANGUAGES`/`SIDE_LANGS`/`LANG_OPTIONS` arrays are in production. Pre-deploy `/local-smoke` PASS confirmed `language: "la"` and `language: "grc"` round-trip through `POST /api/courses` end-to-end and Claude SDK is invoked with the new codes.
- Added **Latin (`la`) and Ancient Greek (`grc`)** to the course-language and per-side import-language dropdowns. Frontend-only — the BCP-47 regex in `api/src/functions/courses-shared.ts` already accepted both codes; the UI was the missing half. Three arrays extended (`LANGUAGES` + `SIDE_LANGS` in `frontend/src/screens/CourseList.jsx`, `LANG_OPTIONS` in `frontend/src/screens/PhotoImport.jsx`) plus two new i18n keys per locale (`courses.sideLang.la` → "Latin"/"Latijn"; `courses.sideLang.grc` → "Ancient Greek"/"Oudgrieks"). 4 new tests (`CL-langs`-prefixed in `CourseList.test.jsx`, `PI-langs` in `PhotoImport.test.jsx`); 622 frontend tests pass. TTS gracefully degrades — browsers don't ship voices for either language and `tts.js` `isAvailable()` already filters them out, so the audio button hides. Coverage on touched files maintained: `CourseList.jsx` 98.73% lines, `PhotoImport.jsx` 97.23% lines (Tier B 70% comfortably met). Auth/Claude seams untouched — security scan skipped per the autonomous-mode rule. Plan: [plans/done/post-v1-latin-greek-languages.md](plans/done/post-v1-latin-greek-languages.md). User-guide updated with a note about TTS unavailability for classical languages.
- Verified deploy of `bae383f` (photo-compression slice) to Azure SWA. GH Actions [run 25214304016](https://github.com/waldo1001/LexiQuest/actions/runs/25214304016) completed in 1m51s on 2026-05-01 (verification deferred a day). Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 with expected msg; `/api/users/public` returns 6 users with no `password_hash` field (invariant #4 holds); `/` serves index.html SPA root; `/api/me` unauth → 401 (auth runs as expected). The slice is frontend-only — no new API route to probe — bundle landing confirms the new `image-compress.js` module is shipped.

## 2026-05-01

- Shipped **client-side photo compression** (post-v1, single slice). New pure module `frontend/src/lib/image-compress.js` exporting `compressImageIfNeeded(file, opts)` — files at or below 3.5 MB (and any non-image MIME) pass through unchanged; oversized images decode via `createImageBitmap`, draw onto a canvas with the longest side capped at 2000 px (aspect preserved), and re-encode as `image/jpeg` at q=0.85 with one fallback pass at q=0.7 if still over target. Returns `{ file, compressed, originalSize, finalSize }`. `PhotoImport.jsx` calls it before `readAsBase64` (skipping `.pdf` and `.pptx`) and renders a `<p role="status">` notice "Photo compressed for upload (X MB → Y MB)". The backend's 5 MB base64 cap (`MAX_IMAGE_PAYLOAD_BYTES` in `cards-import.ts`) is unchanged — it stays as a server-side safety net. Zero new runtime dependencies. 15 new tests (10 in `image-compress.test.js` covering pass-through, downscale, aspect ratio, retry-at-fallback-quality, PNG→JPEG, decode-failure, double-null toBlob, no-extension filename + 5 in `PhotoImport.test.jsx` PI-C1..PI-C5 covering the small-file, large-file, failure, PDF-skip, PPTX-skip branches). 617/617 frontend tests pass. Coverage: `image-compress.js` 100/96.55/100/100 (Tier A 90% met), `PhotoImport.jsx` 97.22/84.74/100/97.22 (Tier B 70% met). Auth/Claude/HMAC seams untouched — security scan skipped per the autonomous-mode rule. 2 new i18n keys per locale (`import.compressed`, `import.error.compressFailed`). HEIC and PDF/PPTX compression are out of scope. Plan: [/Users/waldo/.claude/plans/in-some-cases-the-wobbly-newell.md](/Users/waldo/.claude/plans/in-some-cases-the-wobbly-newell.md). User-guide updated under "Photo / PDF / PowerPoint import".
- Deployed `21bbd49` (and the six pptx-import commits `0b9c650`, `88bde75`, `9d1e863`, `a826470`, `56e0b07`, `7d982a8`) to Azure SWA. Build+Deploy 1m25s, run green. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 with expected msg; `/api/users/public` returns 6 users with no `password_hash` field (invariant #4 holds in production); `POST /api/cards/import` with the new pptx mimeType returns 401 unauthenticated — route registered, auth runs first as expected (a mimeType-validation 400 would mean the new branch wasn't deployed). Run: https://github.com/waldo1001/LexiQuest/actions/runs/25207382007.
- Shipped **PowerPoint (.pptx) import** (post-v1, all 5 slices). Users can now upload a `.pptx` file on the same Import screen as photos/PDFs and get card candidates back. Slides are parsed server-side (no OCR, no Claude vision call) — `jszip` unzips the deck, slide text and per-slide speaker notes are extracted from `ppt/slides/*.xml` and `ppt/notesSlides/*.xml`, and Claude receives a labeled `<slides>` block pairing on-slide text with its notes per slide. v1 is text-only: image-only slides are skipped and listed on the Review screen via a `Skipped image-only slides: 3, 7` notice. **Slice 1** (commit `0b9c650`): pure `pptx-extractor.ts` module, 8 tests, 100% coverage. **Slice 2** (commit `88bde75`): `ClaudeClient.extractCardsFromSlides()` sibling method + `buildSlidesExtractPrompt()` with the prompt-injection-hardening `<slides>` envelope, 4 tests. **Slice 3** (commit `9d1e863`): `POST /api/cards/import` accepts the pptx mimeType, decodes → extracts → calls `extractCardsFromSlides`, returns `{ candidates, skippedSlides }`; 32 MB cap (same as PDF), 8 tests. **Slice 4** (commit `a826470`): `PhotoImport.jsx` `accept` extended, mimeType inference checks `.pptx` extension first, `skippedSlides` forwarded into navigation state, 4 tests. **Slice 5** (commit `56e0b07`): `ImportReview.jsx` renders the `skipped-slides-notice` when present, 2 tests + 1 i18n key per locale (en/nl). 26 new tests overall; api 939 + frontend 603 = 1542 passing. Tier-appropriate coverage met on every touched file. Auth-boundary meta-test still passes (invariant #1). Security scans on slices 2 and 3 (ClaudeClient + auth-bearing endpoint touched) both PASS. Plan: [/Users/waldo/.claude/plans/would-it-make-sense-federated-mitten.md](/Users/waldo/.claude/plans/would-it-make-sense-federated-mitten.md). User-guide updated under "Photo / PDF / PowerPoint import".
- Deployed `9e1f603` (and the four feature commits `e3abd4e`, `8be0180`, `a226e1d`, `10bc416`) to Azure SWA. All five workflow runs green. Live probes against `https://ashy-cliff-0c1975603.7.azurestaticapps.net`: `/api/hello` 200 with expected msg; `/api/users/public` returns 6 users, no `password_hash` field; `/api/cards/import` posted with the new `extraInstructions` field returns 401 (auth-protected, route registered); `/api/me` 401 unauth. Final feature run: https://github.com/waldo1001/LexiQuest/actions/runs/25204776025.
- Shipped **Import instruction presets** (post-v1, all 4 slices). Free-text "Extra instructions" textarea on the photo/PDF import screen lets the user steer Claude card extraction (e.g. *"only nouns, full sentences"*, *"questions in French, answers in English"*, *"ignore page footers"*); reusable as named **presets** persisted on `user.settings.import_instruction_presets` via `PATCH /api/me`. Inline CRUD (Save as new / Update / Delete) lives directly on the import page — no separate Settings section, no new route. **Slice 1** (commit `e3abd4e`): API accepts optional `extraInstructions` (≤1000 chars) on `POST /api/cards/import` and forwards into `ClaudeClient.extractCards`. **Slice 2** (commit `8be0180`): extracted pure helper `buildExtractPrompt(input)` from `extractCards` and weaves the instructions into the prompt above the trailing `Return JSON only` line, with an explicit guard line — *"never break the JSON output contract above"* — keeping the strict JSON contract as the model's last instruction (prompt-injection hardening). **Slice 3** (commit `a226e1d`): `UserRow.settings.import_instruction_presets: Array<{id, name, body}>` with `PATCH /api/me` validation (≤20 entries, id ≤64 chars unique non-empty, name 1..80 chars, body 1..1000 chars; replace-not-merge so deletes work). **Slice 4** (commit `10bc416`): `PhotoImport.jsx` gets the textarea, the conditional saved-presets dropdown, and the three buttons; mirrors `AdminPanel`'s `promptFn`/`confirmFn` injection pattern. 41 new tests across `cards-import.test.ts` (6) + `claude.test.ts` (8) + `me.test.ts` (14) + `PhotoImport.test.jsx` (13); api 901 + frontend 597 = 1498 passing. Tier-appropriate coverage met on every touched file. End-to-end smoke after each slice — preset round-trip via PATCH, import payload with the new field, frontend production build all green. Plan: [/Users/waldo/.claude/plans/when-i-import-a-giggly-manatee.md](/Users/waldo/.claude/plans/when-i-import-a-giggly-manatee.md). User-guide updated under "Steering imports with extra instructions".

## 2026-04-30

- Shipped **Copy upload cards** (post-v1). New `POST /api/cards/copy` (`api/src/functions/cards-copy.ts`) copies all forward cards from a source upload to a target upload in the same course, skipping cards whose normalized question (`trim().toLowerCase().replace(/\s+/g, " ")`) already exists in the target upload (and within the source itself). Reverse cards are skipped — they're derived data; the user re-runs `cards-reverse` on the target if wanted. Copies get fresh UUIDs, reset SM-2 state (ease=2.5, interval=0, reps=0, next_review_at=now), the target's `upload_id`+`upload_name`, and preserve `source`. CardManager gained a 📋 button per upload group (testid `upload-copy-${uploadId}`) + an inline `copy-row` mirroring the existing rename pattern; the button is disabled when no other uploads exist. Four i18n keys added (en+nl). 41 new tests across cards-copy.test.ts (29) + api.test.js (3) + CardManager.test.jsx (7 copy + 2 rename — opportunistically lifted CardManager function-coverage from a pre-existing 65% to 80%); cards-copy.ts at 100% all metrics. Auth-boundary meta-test still passes (invariant #1). Deployed `efcd246` to Azure SWA; live probes green (`/api/hello` 200, `/api/users/public` 6 rows no hashes, `/api/cards/copy` unauthenticated → 401 confirming the new route registered + auth-protected). Run: https://github.com/waldo1001/LexiQuest/actions/runs/25160300180. Plan: [/Users/waldo/.claude/plans/i-want-to-be-cosmic-goose.md](/Users/waldo/.claude/plans/i-want-to-be-cosmic-goose.md).
- Patched the `/local-smoke` skill to run `npm run build` in `api/` before `swa start`. `swa start` boots the compiled Functions host out of `api/dist/src/index.js`; the npm `prestart` hook does NOT fire under `swa start`, so any newly added function silently 404s in smoke even though the TS file exists and unit tests pass. Discovered when post-ship smoke for `cards/copy` returned 404 immediately after the feature shipped — production was unaffected because the GitHub Actions SWA workflow builds the API in its pipeline, but local smoke needed an explicit step. `dev-start` already had this step; only `local-smoke` was missing it. Deployed `3ea5144` (skill-only change, no app-code impact). Run: https://github.com/waldo1001/LexiQuest/actions/runs/25160702725.

## 2026-04-29

- Fixed the **Study font size** setting silently reverting after a reload. The frontend (Settings dropdown + StudySession inline `fontSize`) was wired correctly back in commit `1082292`, but the backend `validatePatch` in `api/src/functions/me.ts` had no allowlist branch for `study_font_size` — `PATCH /api/me` returned 200 OK while dropping the field. Added `study_font_size?: "normal"|"large"|"xlarge"` to `UserRow.settings` (`api/src/shared/seed.ts`), a `STUDY_FONT_SIZES` allowlist + validator branch in `me.ts`, and 3 new tests in `me.test.ts` (accept-and-persist round-tripping all three values, reject invalid string and non-string, preserve other settings on partial patch). `me.ts` 100% line/function coverage maintained; full api suite 847 passing (1 skipped Azure integration). Plan: [plans/done/post-v1-study-font-size-persistence.md](plans/done/post-v1-study-font-size-persistence.md).
- Added User Picker (route `/`) as the 5th bottom-nav item — icon 👥, labels EN "Users" / NL "Gebruikers", positioned rightmost after Settings. Lets a logged-in user jump back to the who-are-you screen to switch accounts on a shared family device without manually editing the URL. 1 new test (BN-8) in `BottomNav.test.jsx`; `BottomNav.jsx` coverage 100% all metrics. Deployed `5e7bf1c` to Azure SWA; live probes green (root 200; `/api/users/public` returns 6 users, no hashes). Run: https://github.com/waldo1001/LexiQuest/actions/runs/25118820312.

## 2026-04-28

- Added a second Claude LLM call (`verifyCardLanguages`) in the card-import pipeline. When both `questionLang` and `answerLang` are specified (and differ), the API now calls Claude a second time to detect language-assignment mismatches and swap `question`/`answer` if the question text is actually in the answer language. 4 new tests (AC32–AC35) in `cards-import.test.ts`; `VerifyLanguagesInput` added to the `ClaudeClient` seam; `FakeClaudeClient` supports `nextVerifiedCards` / `nextVerifyError`. Tier A coverage maintained at 100% on both `cards-import.ts` and `claude.ts`.

## 2026-04-27

- Shipped "Add cards to an existing upload" (post-v1, both slices). Slice A (commit `06a3811`) lets a manual card land in any existing upload group: `POST /api/cards` accepts an optional `upload_id`, validates it via the new course-scoped `findExistingUpload` helper, stamps `upload_id` + inherited `upload_name`, and rejects cross-course or non-existent ids with 400. CardManager's New-card form gained an "Add to" `<select>` (default *Manual*) plus a per-upload ➕ button that opens the form pre-targeted to that upload; bidirectional reverses inherit the same upload identity. Slice B (commit `f97e61f`) extends the import flow: `POST /api/cards/batch` accepts an optional `uploadId` (mutually exclusive with `uploadName`), reuses that upload's identity instead of minting a new one, and bidirectional reverses again inherit. PhotoImport now calls `fetchCards` on mount and renders an "Add to upload" selector (New upload + each existing upload), pre-selecting from `state.uploadId`; ImportReview swaps the "Name this upload" input for an "Adding cards to: {name}" line when an `uploadId` is in nav state and posts `uploadId` instead of `uploadName`; CardManager gained a per-upload 📷 "Import here" link that pre-targets the importer. PDF support, already accepted at the seam, is now pinned end-to-end by an explicit FE test (`application/pdf` mime propagates through to `importCards`). 28 new tests (7 helper, 12 API, 9 FE) — full suites 830 api + 550 frontend = 1380 passing. Plan: [plans/done/post-v1-add-to-existing-upload.md](plans/done/post-v1-add-to-existing-upload.md).
- Shipped online-only PWA (Slice 1). Custom home-screen icon generated from `frontend/scripts/icon-source/waldo.png` via new `npm run icons` (sharp-based `frontend/scripts/generate-icons.mjs`) producing 4 PNG variants (192/512, `any` + `maskable`). `manifest.json` split into separate `any` and `maskable` icon entries (no more conflated `"any maskable"`). `index.html` got an `apple-touch-icon` link. `staticwebapp.config.json` `navigationFallback.exclude` extended with `/icons/*`, `/manifest.json`, `*.webmanifest` so SWA serves them as static assets instead of returning `index.html`. New tests: `pwa.test.js` PWA-9..12 and `__build__/pwa-build.test.js` PWA-B1..B3 (slow integration: runs the real `vite build` and validates manifest + service worker + valid PNG magic bytes). Full frontend suite 535 passing. Plan: [plans/done/pwa-online-only.md](plans/done/pwa-online-only.md).
- Shipped Waldo image avatar (Slice 2). Added optional `UserRow.avatar_image_url`; Waldo's seed entry now sets `/icons/icon-192.png`. New strict allow-list regex `^/icons/[a-z0-9-]+\.(png|webp)$` blocks external URLs, `javascript:`, path-traversal, querystrings, and SVG. `GET /api/users/public` and `fullProfile` now project the field (nullable); `PUT /api/users/:id` updates and clears it (null → delete). New `<Avatar>` component centralises the image-or-emoji decision and is wired into `UserPicker`. Tests AVATAR-1..16 across `seed`, `users-public`, `users-shared`, `users-id`, `Avatar`, and `UserPicker` (16 new tests). Migration of the existing Waldo row is manual (admin PUT). Plan: [plans/done/waldo-image-avatar.md](plans/done/waldo-image-avatar.md).
- Deployed `9b314d7` to Azure SWA + ran prod seed backfill. Live probes green: new waldo PNG hashes match local; `/api/users/public` now returns `avatar_image_url=/icons/icon-192.png` for Waldo (kids unchanged). Run: https://github.com/waldo1001/LexiQuest/actions/runs/24984788713.
- Reverted the admin-filter on `GET /api/users/public`. Waldo now appears in the student picker alongside Lex, Mats, Ben, Kaat, Amaryllis (all six visible, sorted alphabetically). The yesterday's filter was over-engineered for the actual use case — the family wants Waldo on the picker for quick login. Test renamed to `includes admin users in the picker`. Docs (`README.md`, `docs/setup.md`, `docs/getting-started.md`, `docs/deployment.md`, `.env.example`, `PROGRESS.md`) updated to reflect.

## 2026-04-26

- Added Kaat (`#f59e0b`, 🐰) and Amaryllis (`#ec4899`, 🌸) to `SEED_USERS`. 4 new tests in `seed.test.ts`; 100% coverage on `seed.ts`. `docs/setup.md` and `docs/deployment.md` (§1c, §1d, new §1e "Adding new family users to live") document the two new `PASSWORD_KAAT` / `PASSWORD_AMARYLLIS` env vars. See [plans/seed-users-kaat-amaryllis.md](plans/seed-users-kaat-amaryllis.md). (An admin-filter on `/api/users/public` shipped in this commit was reverted on 2026-04-27 — see entry above.)
- Added the production deployment runbook + live→dev snapshot tooling. New pure helpers `isAzuriteConnectionString` (6 tests, 100% coverage) and `buildSnapshotPayload` (6 tests, 100% coverage). New scripts `npm run export-all` (reads from `AZURE_STORAGE_CONNECTION_STRING_SOURCE`, requires `--yes`, writes `backups/lexiquest-<date>.json`) and `npm run import-local` (refuses any non-Azurite connection string via the slice-1 latch; truncates+reloads each table; idempotent). Both scripts `v8-ignored` per the `seed.ts` precedent and integration-verified against Azurite. New `docs/deployment.md` runbook. `backups/` added to `.gitignore`. See [plans/done/deployment-and-live-to-dev-snapshot.md](plans/done/deployment-and-live-to-dev-snapshot.md).
- Pre-public-GitHub safety gate run on `HEAD`: `git log --all -- api/local.settings.json` empty; full-history secret-pattern scan returned only synthetic placeholders + the well-known public Azurite key (replaced with `fake==` in the test fixture); `/security-scan` PASS for changes in this slice. Pre-existing finding: `npm audit` reports 4 high in `frontend/` dev-deps via `vite-plugin-pwa` → `workbox-build` → `@rollup/plugin-terser` → `serialize-javascript`; not introduced by this work, fix requires breaking-version downgrade — surfaced as a separate follow-up.
- Fixed speed round MCQ choices reshuffling on every timer tick by memoizing `mcqChoices` with `useMemo` keyed to card ID. 2 new tests. See [plans/done/bugfix-mcq-reshuffle-speed-round.md](plans/done/bugfix-mcq-reshuffle-speed-round.md).
- Changed PhotoImport so both "Speak questions in" and "Speak answers in" default to the user's UI language instead of question defaulting to course language. See [plans/done/post-v1-import-lang-default.md](plans/done/post-v1-import-lang-default.md).
- Added per-upload stats: `GET /api/stats/course/{courseId}/uploads` endpoint (17 API tests), `UploadStats.jsx` screen (9 tests), privacy meta-test, frontend API wrapper (4 tests), CardManager link, 16 i18n keys (EN + NL). Route: `/stats/course/:courseId/uploads`.

## 2026-04-25 (post-v1 — Gaming mode: session length + game types)

- Added `card-priority.ts` with `scoreCard()` (0.7× overdue + 0.3× mastery) and `buildQueue()` supporting all 4 game types. 17 tests, 97% branch coverage. See [plans/done/gaming-mode.md](plans/done/gaming-mode.md).
- Extended `SessionRow`/`SessionCreateBody` with `game_type` (`classic|boss_round|speed_round|review_blitz`) and `card_limit` (number|null). Backward-compatible defaults. 7 new validation tests.
- Wired `buildQueue()` into `POST /api/sessions`; speed round returns `time_limit_seconds: 60`. 9 new session tests covering all game types + edge cases.
- Extended `computeSessionXp` with per-game-type multipliers (classic 1.0×, boss 1.5×, speed 1.25×, blitz 1.0×) + boss round completion bonus (+50 XP). Wired `bossRoundComplete` into badge engine. 6 new XP tests.
- Added `SessionSetup` screen (`/courses/:courseId/setup`): game type picker (4 cards), card count pills (10/15/20/30/All), mode picker. 8 tests. ~24 new i18n keys (EN + NL).
- Added speed round timer to `StudySession`: 60 s countdown (wall-clock delta), auto-finish on expiry, no retry pile. 4 new tests.
- Updated `SessionResults` with game type badge, XP multiplier display, cards-per-minute for speed round. "Study again" navigates to setup. 5 new tests.
- Updated `CourseList` to link to `/setup` instead of starting study directly. 2 replacement tests.

## 2026-04-25 (Phase 18 — Bidirectional cards)

- Added `reverse_of` field to `CardRow`/`CardProfile` and `"reverse"` to `CardSource`. Pure `buildReverseCard()` swaps Q↔A, applies pipe-split (first alternative only), swaps per-side languages, sets `source="reverse"`. 8 new shared tests. Phase 18 Slice 1.
- Added `POST /api/cards/reverse`: bulk-generates reverse cards for a course; idempotent (skips cards that already have reverses). Returns `{ created, skipped }`. 11 tests. Phase 18 Slice 2.
- Added `bidirectional` flag to `CourseRow`, `CourseCreateBody`, `CoursePatchBody`, `courseProfile()`. When a course is bidirectional, `POST /api/cards` and `POST /api/cards/batch` auto-create reverse cards alongside forward cards. Import Review screen gains a "Also create reverse cards" checkbox (defaults on when course language differs from UI language). CourseList create/edit forms gain bidirectional toggle. 13 new API tests, 9 new frontend tests. Phase 18 Slices 3–4.
- Card Manager pairing UI: ↔ badge with tooltip ("Paired with: {question}") on forward/reverse cards. Linked delete: deleting a paired card shows a second confirm asking whether to also delete the partner; confirming deletes both, declining deletes only the chosen card. 8 new frontend tests. New i18n keys: `cards.badge.paired`, `cards.confirm.deleteAlsoReverse`, `cards.confirm.deleteAlsoForward` (EN + NL). Phase 18 Slice 5 — **Phase 18 complete**.

## 2026-04-25 (post-v1 — per-side card language for TTS)

- Added `question_lang` and `answer_lang` fields to `CardRow`, `CardProfile`, `CardCreateBody`, `CardPatchBody` with BCP-47 validation. `cardProfile` defaults missing fields to `null` for legacy rows. `parseCards` normalizes missing per-side language from Claude JSON to `null`. `cards-batch` and `cards` handlers persist the fields; `cards-id` merges them on PATCH. 14 new API tests. See [plans/done/per-side-card-language.md](plans/done/per-side-card-language.md).
- Updated `StudySession` and `CardManager` TTS calls to use `card.question_lang ?? courseLang` for the question side and `card.answer_lang ?? courseLang` for the answer side, both for auto-speak and manual speak buttons. 6 new frontend tests.
- Added language picker dropdowns to `PhotoImport` screen: when a course has a language set, two `<select>` elements let the user specify question-side and answer-side languages (defaults: course language / UI language). Values pass through `POST /api/cards/import` → Claude prompt → candidates → `ImportReview` → `batchCreateCards`. `cards-import.ts` validates optional `questionLang`/`answerLang` as BCP-47. Claude prompt now uses explicit languages when provided instead of guessing. 13 new tests (8 frontend, 5 API). New i18n keys: `import.questionLang`, `import.answerLang`, `import.langNone` (EN + NL).
- Added course-level per-side language defaults (`question_lang_default`, `answer_lang_default`) to `CourseRow` and `courseProfile`. The TTS fallback chain is now `card.question_lang ?? questionLangDefault ?? courseLang` — this fixes pronunciation for ALL cards (old imports, manual cards) without patching individual rows. Course edit form gains two dropdowns for the new fields (visible only for language courses). `PhotoImport` defaults from course-level defaults when available. 12 new API tests, 3 new frontend tests.

## 2026-04-25 (post-v1 — flexible card deletion)

- Added `upload_id` grouping to AI-imported cards: `POST /api/cards/batch` now mints one `upload_id` per request and stamps it on every created card; the response shape becomes `{ upload_id, cards: [...] }`. Manual `POST /api/cards` writes `upload_id: null`. `cardProfile` coerces missing `upload_id` to `null` so legacy rows render under "Manual cards". 7 new api tests. See [plans/done/post-v1-card-delete-flexibility.md](plans/done/post-v1-card-delete-flexibility.md).
- Added `POST /api/cards/bulk-delete` with three mutually-exclusive selectors: `{ courseId, uploadId }`, `{ courseId, ids: [] }`, `{ courseId, all: true }`. Owner-or-admin only; returns `{ deleted: number }`. Idempotent (`deleted=0` for unknown selectors). Course-scoped — never touches cards in other courses, even if they share an `upload_id`. 22 tests, 100% statement / 98.48% branch coverage.
- `CardManager` groups cards by upload (timestamp-labelled) with a "Manual cards" group for cards without an `upload_id`. Owner/admin actions: per-upload "Delete this upload", multi-select checkboxes + "Delete selected (N)" toolbar, and a guarded "Delete all cards". All three confirm with specific copy showing the count. 8 new screen tests. New i18n keys (`cards.group.manual`, `cards.group.upload`, `cards.action.deleteUpload`, `cards.action.deleteSelected`, `cards.action.deleteAll`, `cards.confirm.*`, `cards.status.bulkDeleted`, `cards.select`) added in EN + NL.
- Added `bulkDeleteCards({ courseId, uploadId?, ids?, all? })` to `frontend/src/lib/api.js` (5 new tests).

## 2026-04-23 (post-Phase 17 fixes)

- Themes + responsive layout: three user-selectable themes (`classic`, `playful` [default], `arcade`) persisted in `settings.theme`, applied via `[data-theme-name]` on `<html>`. Arcade forces dark mode; classic and playful keep dark mode orthogonal. Rewrote [frontend/src/index.css](../frontend/src/index.css) with a token system (`--space-*`, `--radius*`, `--shadow*`) and fluid layout (`clamp()` padding, 100 %-width main with `max-width: min(92vw, 1120px)`), killing the 960 px column rails. `BottomNav` hidden above 720 px. Server-side: extended `UserRow.settings.theme` and `/api/me` PATCH validator with a `THEMES` allowlist; 2 new api tests. Client-side: `AppContext` gains `themeName` + `setThemeName` (persists via `patchMe`), auto-syncs from `user.settings.theme` after login; Settings screen grows a theme dropdown. 4 new frontend tests. New seeded users default to `playful`. Nunito + JetBrains Mono loaded from Google Fonts. See [plans/done/phase-17-themes-and-responsive.md](plans/done/phase-17-themes-and-responsive.md).
- Fixed "New card" button not appearing for course owners: `AppContext.user` was never hydrated after login, so `CardManager`'s `canEdit` check always saw `null`. Home now calls `setUser()` after fetching `/api/me`; `CardManager` switched from the old snake_case `user.is_admin` typo to the API-correct `user.isAdmin`. Test fixtures updated.
- Fixed session cookie being dropped on local HTTP: `Secure` flag is now conditional on `COOKIE_SECURE` env var (defaults to on; set `COOKIE_SECURE=false` in `api/local.settings.json` for local `swa start`). `buildSessionCookie` / `buildClearedSessionCookie` take `secure` as an explicit arg; `registerLogin` / `registerLogout` receive `cookieSecure` from the composition root. 4 new tests in `session-cookie.test.ts`, `login.test.ts`, `logout.test.ts`. See [plans/done/phase-17-fix-cookie-secure-flag.md](plans/done/phase-17-fix-cookie-secure-flag.md).
- Visual polish pass: added `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.card` / `.card-tile` / `.panel` / `.field` / `.input` / `.badge` / `.stack` / `.row` / `.narrow` utility classes to [frontend/src/index.css](../frontend/src/index.css). Applied to UserPicker, Login, Home, Dashboard, CourseList, StudySession, Settings. Introduces a design-token layer (`--radius`, `--space-*`, `--shadow-*`, `--accent-h`, `--danger`) and explicit `[data-theme="dark"]` + `prefers-color-scheme: dark` palettes. 4 new class-presence tests as regression guards. See [plans/done/phase-17-visual-polish.md](plans/done/phase-17-visual-polish.md).

## 2026-04-23 (Phase 17 complete — all 17 phases done)

- Added `GET /api/export`: returns `{ user, courses, cards, sessions, attempts }` (own data only; admin can pass `?userId=`). Strips `password_hash`. Sets `Content-Disposition: attachment`. 9 tests, 100% coverage. Phase 17 Slice 3.
- Added "Export my data" download link to Settings screen; triggers `lexiquest-{name}-{date}.json` download. Phase 17 Slice 3.
- Added `BottomNav` component: fixed bottom navigation (Dashboard / Study / Family / Settings) with `aria-current="page"` on active link. 7 tests. Phase 17 Slice 4.
- Added swipe gestures to `StudySession` card area: swipe right = Knew it, swipe left = Didn't know (ANSWER phase only, 60 px threshold). 3 tests. Phase 17 Slice 4.
- Added dark mode support: `setDarkMode('dark'|'light'|'system')` in AppContext applies `data-theme` to `<html>`; theme select in Settings. 4+2 tests. Phase 17 Slice 4.
- Added `OfflineBanner` component: renders `role="alert"` div when `navigator.onLine` is false or when `offline` event fires; hides on `online` event. 4 tests. Phase 17 Slice 5.
- Added `ErrorPage` component: friendly 403 / 404 / 500 pages with back-to-home link. 4 tests. Phase 17 Slice 5 — **Phase 17 complete**. Tagged `phase-17-done`. See [PROGRESS.md](../PROGRESS.md).

## 2026-04-23 (Phase 16 complete)

- Added `GET /api/leaderboard?period=7d|30d|all`: XP-sorted rankings with per-user sessions/cards/accuracy/streak; secondary awards for mostAccurate, longestStreak, mostSessions. 10 tests, 100% coverage. Phase 16 Slice 1.
- Added `Leaderboard` screen (`/leaderboard`): period toggle, ranked list with XP, 3 secondary award cards. Links to UserStats per entry. Phase 16 Slice 2.
- Added `CompareView` screen (`/compare`): user chips (all on by default), metric dropdown (XP/Accuracy/Sessions/Cards/Minutes), range selector, LineOverTime chart. Phase 16 Slice 3 — **Phase 16 complete**. See [PROGRESS.md](../PROGRESS.md).

## 2026-04-23 (Phase 15 complete)

- Added 7 Recharts chart wrapper components (`frontend/src/charts/`): `LineOverTime`, `DailyBars`, `HourHistogram`, `MasteryStack`, `TopNBars`, `ResponseTimeHistogram`, `CalendarHeatmap` (GitHub-contrib style custom SVG). 18 tests, 94.59% branch coverage. Phase 15 Slice 1+2.
- Added `FamilyDashboard` screen (`/family`): per-user cards (avatar, streak, XP, accuracy), range selector (7d/30d/90d/1y/all), XP-over-time + accuracy-trend charts. Added `fetchFamilyStats`, `fetchCompareStats`, `fetchUserStats`, `fetchCourseStats`, `fetchHeatmap` to `frontend/src/lib/api.js`. Phase 15 Slice 3.
- Added `UserStats` screen (`/stats/user/:userId`): header (name/level/XP/streak), range selector, tabs (Overview/Per Course/Badges), activity heatmap, XP + accuracy charts, hour histogram, response-time chart. Phase 15 Slice 4.
- Added `CourseStats` screen (`/stats/course/:courseId`): mastery distribution (MasteryStack), sessions over time (DailyBars), card struggle list (TopNBars). Phase 15 Slice 5 — **Phase 15 complete**. See [PROGRESS.md](../PROGRESS.md).

## 2026-04-23 (Phase 13 + 14 complete)

- Added `POST /api/cards/enrich`: Claude enriches MCQ distractors for all cards in a course (owner or admin only); `enrichCards` API wrapper; EN+NL strings. Phase 13 Slice 1.
- MCQ study mode in `StudySession`: renders 4-option radio grid, grades by exact match, shows correct option on wrong answer. `startSession` now accepts `mode` param. Phase 13 Slice 2.
- Mode picker on `CourseList` for `default_mode === 'ask'` courses: toggleable inline section with self-grade / MCQ / mixed buttons, `useNavigate`-driven. Phase 13 Slice 3 — Phase 13 complete.
- Added `aggregate.ts` helpers: `masteryBucket`, `groupByDay`, `rollingAverage`, `parseRange`, `fetchAttempts`, `fetchSessions`, `fetchCards`. Upper-bound row-key range uses `to.toISOString() + "~"`. 19 tests, 100% coverage. Phase 14 Slice 1.
- Added `GET /api/stats/user/:userId`: totalXp, level, streaks, trends, hourOfDay, responseTimeBuckets, masteryDistribution, badgesEarned. Family visibility (any authenticated user). Cache-Control: private, max-age=60. Phase 14 Slice 2.
- Added `GET /api/stats/course/:courseId` + struggle list (top 20 by fail count). Phase 14 Slice 3.
- Added `GET /api/stats/family` (per-user summary) and `GET /api/stats/compare` (metric time-series overlay). Phase 14 Slice 4.
- Added `GET /api/stats/heatmap/:userId` (daily attempt counts). Phase 14 Slice 5.
- Added `api/__meta__/stats-privacy.test.ts` (invariant 2): static scan + behavioral check that no raw rowKey/partitionKey/password_hash leaks from stats endpoints. Phase 14 Slice 6 — Phase 14 complete.

## 2026-04-23 (Phase 12 complete)

- Added `ClaudeClient` seam (`api/src/shared/claude.ts`): `extractCards(input)` + `enrichDistractors(input)` interface; `stripFences` + `parseCards` pure helpers (10 tests, 100% coverage); `createClaudeClient(apiKey)` real implementation using `claude-sonnet-4-6` (v8-ignored). `FakeClaudeClient` in `api/testing/`. Fixed pre-existing branch gaps in `streak.ts`, `stats-session.ts`, `sessions-id.ts`. Phase 12 Slice 1.
- Added `POST /api/cards/import`: auth-guarded (course owner or admin), calls `claude.extractCards`, returns candidates array — never persists (invariant 3). 17 tests, 100% coverage. Registered in composition root. Phase 12 Slice 2.
- Added `POST /api/cards/batch`: batch-creates cards with `source=ai_import` and SM-2 defaults; course owner or admin only. 17 tests, 100% coverage. Registered in composition root. Phase 12 Slice 3.
- Added `PhotoImport` screen (`/courses/:id/import`): file picker → FileReader → base64 → `POST /api/cards/import` → navigate to review on success; parse_error / claude_error / generic error messages. Added `ImportReview` screen (`/courses/:id/import/review`): per-card checkboxes (default checked), editable, "Save selected" → `POST /api/cards/batch` → navigate to CardManager. Import link added to CardManager for owners/admins. `importCards` + `batchCreateCards` API wrappers + 8 new api.test.js tests. EN + NL `import.*` + `review.*` i18n strings. 27 screen tests. Phase 12 Slice 4 — **Phase 12 complete**. See [PROGRESS.md](../PROGRESS.md).

## 2026-04-23 (Phase 11 complete)

- Added 🔊 buttons to StudySession (next to question; next to answer after reveal) and CardManager card rows, visible only when `course.language` is set and `tts.isAvailable(lang)` is true. `CourseList` now passes `courseLang` in link state to both screens. 9 new tests; Tier B thresholds met. Phase 11 Slice 2.
- Added `auto_speak` toggle to Settings screen (checkbox wired to `user.settings.auto_speak` via `patchMe({ settings: { auto_speak } })`). StudySession auto-speaks question on card show and answer on reveal when enabled. 7 new tests (3 Settings, 3 StudySession); all 248 tests pass. Phase 11 Slice 3 — Phase 11 complete.

## 2026-04-23 (Phase 11 Slice 1)

- Added `Tts` seam: `frontend/src/lib/tts.js` (`createTts(speechSynthesis, UtteranceCtor)`) wraps `window.speechSynthesis` with `isAvailable(lang)` (prefix-match, assumes available when voices not yet loaded) and `speak(text, lang, rate=0.9)` (cancels, defers via `onvoiceschanged` when needed); no-op when speechSynthesis null. `frontend/src/testing/fake-tts.js` (`createFakeTts`) records calls for test assertions. `useTts()` hook added to `AppContext`; `App.jsx` wires real `createTts(window.speechSynthesis)`. 19 new tts tests + 3 AppContext tests; `tts.js` 100% lines/branches/functions; all 232 frontend tests pass. See [plan](plans/done/phase-11-slice-1-tts-seam.md).

## 2026-04-23 (Phase 9 + 10 catch-up)

- Phase 9 complete: row-key format `{iso}_{uuid}` meta-test (Slice 1); `SessionResults` screen showing per-card correct/incorrect breakdown (Slice 2); `GET /api/stats/session/:id` endpoint returning session summary with card-level results (Slice 3).
- Phase 10 complete: `computeSessionXp` pure function (Slice 1); streak logic with `Europe/Brussels` rollover + freeze-token deduction on session-close (Slice 2); badge engine awarding first-session, streak-7, and mastery badges (Slice 3); `Dashboard` screen with XP total, current streak, daily-goal progress, and earned badges (Slice 4).

## 2026-04-22 (Phase 8)

- Implemented `applySm2(card, quality, now)` pure function in `api/src/shared/sm2.ts` and mirrored to `frontend/src/lib/sm2.js`; covers quality-0 reset, rep-0→1 day, rep-1→6 day, rep-2+ × ease, ease floor 1.3, 13 API tests + 5 frontend tests.
- Added `POST /api/sessions`: builds a due+new card queue (due = `next_review_at <= now`; new = `reps==0` not yet due, capped at 20), shuffles via `Random.shuffle`, inserts session row with `ended_at=null`, returns `{ sessionId, cards }`. 12 tests.
- Added `POST /api/attempts`: validates a batch of `{ cardId, correct, mode, response_time_ms }` items + `sessionId`; logs each as an `AttemptRow` with `{iso}_{uuid}` row key; runs SM-2 and upserts each card; 403 on cross-user session. 11 tests.
- Added `PUT /api/sessions/:id`: closes the session — sets `ended_at=now`, `duration_seconds`, `cards_studied`, `cards_correct`; 409 if already closed; 403 on cross-user. 9 tests.
- Added `StudySession.jsx` screen: fetches queue, card-flip UI (question → Show answer → reveal + grade buttons), retry pile for wrong cards, batches all attempts on completion then closes session and navigates to `/courses/:id/results` placeholder. 11 frontend tests; 3 new `api.js` wrappers (`startSession`, `postAttempts`, `closeSession`); "Study" link added to CourseList; EN + NL `study.*` i18n strings. Phase 8 complete — tag `phase-8-done`. See [PROGRESS.md](../PROGRESS.md).
- Fixed Azure Table Storage null→undefined round-trip bug: `ended_at=null` upserted to Table Storage is omitted on read-back as `undefined`; changed `sessions-id.ts` check from `!== null` to `!= null` (catches both) and added `?? null` in `sessionProfile` to normalise the returned shape.
- Added `sessions-shared.test.ts` and `attempts-shared.test.ts` to cover previously-untested shared validators and row-key helpers; all coverage thresholds now met.
- `/local-smoke` PASS (2026-04-22): Azurite + `func start` end-to-end; POST /api/sessions queue verified, POST /api/attempts SM-2 update verified (correct card reps=1/ease=2.60, wrong card reps=0/ease=1.70), PUT /api/sessions close verified.

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
