# Post-v1 — Add cards to an existing upload (manual + import)

## 1. Task

Today, "uploads" (groups of cards sharing an `upload_id` + `upload_name`)
are append-only at creation time and immutable afterwards: the only way
to add cards to an existing upload is to retro-tag rows in storage. The
two ergonomic paths users actually want — "I forgot a card from this
homework sheet, let me type it into the same group" and "here's another
photo / a PDF for the same homework, fold it in" — both fall through to
the *Manual* group or to a brand-new upload.

This plan adds both paths so any existing upload can grow over time:

- **Manual add** — the "New card" form gets an upload-target selector
  (default *Manual*, plus every existing upload in the course). Picking
  an upload tags the new card with that `upload_id` so it lands in the
  correct group.
- **Import (photo / PDF)** — `PhotoImport` gets a target-upload
  selector with the same options plus *New upload*. When an existing
  upload is chosen, the post-review batch is stamped with that
  `upload_id` and inherits the existing `upload_name`. PDF works today
  end-to-end at the seam level ([cards-import.ts:29](../../api/src/functions/cards-import.ts#L29),
  [claude.ts:117](../../api/src/shared/claude.ts#L117) `document` block,
  [PhotoImport.jsx:95](../../frontend/src/screens/PhotoImport.jsx#L95));
  this slice elevates PDF from "accidentally accepted" to "first-class,
  tested, documented".

## 2. Scope boundary

### IN

**API**

- `POST /api/cards` (manual create): accept optional `upload_id` in
  body. When present, validate it (a) exists as `upload_id` on at least
  one card in the same course and (b) the caller is course-owner or
  admin. Stamp the new card with that `upload_id` and the matching
  `upload_name` (read from one existing card in the group). When
  absent, behavior is unchanged (`upload_id: null`).
- `POST /api/cards/batch`: accept optional `uploadId` in body
  (mutually exclusive with `uploadName`). When present, validate the
  same way as above and reuse it instead of minting a new one; the
  response shape stays `{ upload_id, cards }` but `upload_id` is the
  passed-in value. When absent, behavior is unchanged.
- A small shared helper `findExistingUpload(tables, courseId, uploadId)`
  in `cards-shared.ts` returns `{ uploadId, uploadName } | null` so
  both endpoints validate identically.
- Bidirectional course behavior: when the course is `bidirectional`,
  the auto-generated reverse card inherits the same `upload_id` /
  `upload_name` (matches today's batch behavior).

**Frontend**

- `frontend/src/lib/api.js`:
  - `createCard(payload)` already takes an arbitrary object — no
    signature change needed; document that `upload_id` is now allowed.
  - `batchCreateCards(payload)` accepts `{ uploadId }` as well as
    `{ uploadName }`; document mutual exclusivity.
- `CardManager.jsx`:
  - "New card" form gains a `<select>` "Add to" with options:
    *Manual* (value `""` / null) and every upload group currently
    rendered (`uploadId` → `uploadName ?? "Upload of <date>"`).
  - On submit, send `upload_id` only when a non-Manual option is
    chosen.
  - "Import" link gains an optional `?uploadId=…` query param when
    invoked from a specific group's contextual action (see below).
- `CardManager.jsx` per-upload action row gains an "➕ Add card" /
  "📷 Import to this upload" pair (next to the existing rename / delete
  icons). The first opens the New-card form pre-targeted to that
  upload; the second navigates to PhotoImport with the upload pre-
  selected.
- `PhotoImport.jsx`:
  - Add a `<select>` "Add to upload" with options *New upload* (value
    `""`) plus each existing upload, fetched via `fetchCards` on mount.
  - When user picks an existing upload, pass `uploadId` to the post-
    review batch call instead of asking for a name.
  - The Import-Review screen stays the same (it doesn't care about
    upload identity — that's batched on confirm).
  - Pre-select via `?uploadId=` query param if present.
  - Document and test PDF: file-picker still accepts PDFs, the request
    flows through, and the resulting cards land correctly. Add a
    1-page PDF fixture and an end-to-end-shaped unit test that the
    `mimeType` propagates as `application/pdf` to `importCards`.
- `frontend/src/i18n/strings.js`: new strings for "Add to upload",
  "Manual", "New upload", per-upload action labels (en/nl/fr).

**Meta / docs**

- `docs/user-guide.md` — short section: "Adding to an existing upload"
  with two screenshots' worth of prose for the manual path and the
  import path.
- `docs/changelog.md` — one entry covering both halves.
- `PROGRESS.md` — append a "Post-v1: add-to-existing-upload" line under
  the Post-v1 section.
- `docs/setup.md` — note that the Anthropic API call now occasionally
  uses `document` blocks for PDFs; **no env-var change**.

### OUT (explicit non-goals)

- Moving cards between uploads after the fact. (A card created in
  Manual stays in Manual; you cannot drag/drop it into an upload.)
  Follow-up candidate.
- Splitting an upload (e.g. "actually these last 3 cards are a
  different homework"). Out.
- Multi-PDF / multi-photo single import (one file at a time stays the
  rule). Out.
- Page-range selection inside a PDF ("only pages 2–4"). Out — Claude
  reads the whole document. Document the de-facto cap.
- Increasing the file-size cap. PDFs use the same upper bound as
  photos today; no change.
- A first-class `uploads` row in Table Storage. Upload identity stays a
  grouping key on cards; meta (`upload_name`) lives on each card.
- Retroactively binding old Manual cards into an upload via the UI.
- Re-running OCR on the same PDF to add cards (idempotency / dedupe is
  not in scope — re-importing the same PDF will create duplicate cards
  in the targeted upload, same as re-importing the same photo today).

## 3. Files to create / touch

### API

- [api/src/functions/cards-shared.ts](../../api/src/functions/cards-shared.ts)
  — add `findExistingUpload(tables, courseId, uploadId)` helper
  returning `{ uploadId, uploadName: string | null } | null`.
- [api/src/functions/cards.ts](../../api/src/functions/cards.ts)
  — accept and validate `upload_id` on `POST`; stamp row.
- [api/src/functions/cards.test.ts](../../api/src/functions/cards.test.ts)
  — extend with the new validation + happy-path cases.
- [api/src/functions/cards-batch.ts](../../api/src/functions/cards-batch.ts)
  — accept optional `uploadId`; validate; reuse instead of minting.
- [api/src/functions/cards-batch.test.ts](../../api/src/functions/cards-batch.test.ts)
  — extend.
- [api/src/functions/cards-shared.test.ts](../../api/src/functions/cards-shared.test.ts)
  — direct tests for the new helper.

### Frontend

- [frontend/src/screens/CardManager.jsx](../../frontend/src/screens/CardManager.jsx)
  — upload-target selector in New-card form; per-upload "Add card" /
  "Import to this upload" action buttons; pass-through of `uploadId`.
- [frontend/src/screens/CardManager.test.jsx](../../frontend/src/screens/CardManager.test.jsx)
  — new tests for the selector behaviors and the per-upload actions.
- [frontend/src/screens/PhotoImport.jsx](../../frontend/src/screens/PhotoImport.jsx)
  — upload-target selector; PDF stays accepted; pre-select via
  `?uploadId=`.
- [frontend/src/screens/PhotoImport.test.jsx](../../frontend/src/screens/PhotoImport.test.jsx)
  — selector behavior, PDF mime propagation, pre-select.
- [frontend/src/screens/ImportReview.jsx](../../frontend/src/screens/ImportReview.jsx)
  — read `uploadId` (or `uploadName`) from navigation state and pass
  through to batch call. Tests extended.
- [frontend/src/lib/api.js](../../frontend/src/lib/api.js)
  — JSDoc updates only (no signature change).
- [frontend/src/i18n/strings.js](../../frontend/src/i18n/strings.js)
  — new strings (en/nl/fr).

### Docs

- [docs/changelog.md](../../docs/changelog.md)
- [docs/user-guide.md](../../docs/user-guide.md)
- [PROGRESS.md](../../PROGRESS.md)

## 4. Slices

> The user has set autonomous-mode preference: run slices back-to-back,
> commit + push per slice, no approval gate between them. (See
> `feedback_autonomous_tdd.md` in memory.) The two slices below are
> sequential — Slice B builds on the validation helper from Slice A.

### Slice A — Manual add into existing upload

**Goal**: a parent/admin opens *New card* on a course where uploads
already exist, picks one in the dropdown, types Q/A/Hint, submits, and
the card appears under the selected upload group with the correct
`upload_id` / `upload_name`.

Touches:

- API: `cards-shared.ts` (helper), `cards.ts` (POST), tests.
- FE: `CardManager.jsx` (selector + per-upload "Add card" action),
  `i18n/strings.js`, tests.

RED test list:

1. `cards-shared.test.ts`: `findExistingUpload` returns `{ uploadId,
   uploadName }` when at least one card in the course has the
   `upload_id`; returns `null` when no card matches; returns the
   non-null `upload_name` if any card in the group has one.
2. `cards.test.ts` — POST with `upload_id` referring to a real upload
   in the same course → 201, stored row has both `upload_id` and
   inherited `upload_name`.
3. `cards.test.ts` — POST with `upload_id` that does not exist in the
   course → 400 (unknown upload).
4. `cards.test.ts` — POST with `upload_id` that exists in a *different*
   course → 400 (upload not in this course).
5. `cards.test.ts` — POST without `upload_id` (legacy) → 201,
   `upload_id: null`, `upload_name` not set (regression guard).
6. `cards.test.ts` — bidirectional course: reverse card inherits the
   same `upload_id` / `upload_name` as the forward card.
7. `cards.test.ts` — non-owner non-admin → 403 (auth boundary intact;
   cheap regression).
8. `CardManager.test.jsx` — when the loaded cards include at least one
   upload, the New-card form renders the "Add to" `<select>` with
   *Manual* + each upload as options.
9. `CardManager.test.jsx` — submitting with *Manual* selected sends
   no `upload_id` to the API (or `null`); submitting with an upload
   sends that `upload_id`.
10. `CardManager.test.jsx` — per-upload "Add card" button opens the
    New-card form with that upload pre-selected in the dropdown.
11. `CardManager.test.jsx` — after a successful manual add to an
    upload, the new card appears under that group's expanded body, not
    under Manual.
12. `CardManager.test.jsx` — when no uploads exist (fresh course), the
    selector either hides or only shows *Manual* (no regression for
    the existing flow).

Coverage target: Tier A 90% on `cards.ts`, `cards-shared.ts`; Tier B
70% on `CardManager.jsx`.

### Slice B — Import (photo + PDF) into existing upload

**Goal**: a parent/admin opens *Import* (either from the page-level
link or from a per-upload "Import to this upload" button), picks a
photo or PDF, optionally picks a target upload, confirms in Review,
and the resulting cards land under the chosen upload (or as a new
upload if *New upload* is selected).

Touches:

- API: `cards-batch.ts` (accept `uploadId`), tests.
- FE: `PhotoImport.jsx` (selector + pre-select + PDF assertion),
  `ImportReview.jsx` (passthrough), `CardManager.jsx` ("Import to this
  upload" link), `i18n/strings.js`, tests.

RED test list:

1. `cards-batch.test.ts` — POST with `uploadId` referring to a real
   upload in the same course → 201, response `upload_id` equals the
   passed-in value, every created card carries it, `upload_name` is
   inherited from the existing group.
2. `cards-batch.test.ts` — POST with `uploadId` that does not exist
   → 400.
3. `cards-batch.test.ts` — POST with both `uploadId` and `uploadName`
   → 400 (mutually exclusive).
4. `cards-batch.test.ts` — POST with neither → 201, fresh `upload_id`,
   `upload_name: null` (today's behavior, regression guard).
5. `cards-batch.test.ts` — bidirectional course: reverse cards inherit
   the same `upload_id`.
6. `PhotoImport.test.jsx` — on mount, fetches cards for the course and
   populates the "Add to upload" selector with *New upload* + each
   distinct upload from the response.
7. `PhotoImport.test.jsx` — when navigated to with `?uploadId=…` (or
   navigation state), the selector pre-selects that upload.
8. `PhotoImport.test.jsx` — picking a PDF file results in `mimeType:
   "application/pdf"` in the `importCards` request body.
9. `PhotoImport.test.jsx` — picking *New upload* and submitting still
   prompts/uses the existing new-upload-name flow on the Review
   screen (no regression).
10. `ImportReview.test.jsx` — when an `uploadId` is in navigation
    state, the "Confirm" submit passes `uploadId` (not `uploadName`)
    to `batchCreateCards`.
11. `ImportReview.test.jsx` — when an `uploadName` (new upload) is in
    state, behavior is unchanged.
12. `CardManager.test.jsx` — per-upload "Import to this upload" button
    navigates to `/courses/:courseId/import` carrying `uploadId` in
    state.

Coverage target: Tier A 90% on `cards-batch.ts`; Tier B 70% on
`PhotoImport.jsx`, `ImportReview.jsx`, `CardManager.jsx`.

## 5. Seams used

- `TableStorage` — for upload existence lookup
  (`listByPartition<CardRow>("cards", courseId)` already in use; the
  helper just filters in memory). Acceptable: course card counts in
  this app are small (<<10k).
- `Random.uuid()` — only used on the *new-upload* path; reused as-is.
- `Clock.now()` — unchanged.
- `ClaudeClient.extractCards` — already PDF-aware; no change.
- `SessionSigner` / `requireAuth` — no change.

## 6. Invariants preserved

- **Invariant 1 (`user_id` from session)**: both endpoints continue to
  derive `userId` from `requireAuth`. The new `upload_id` lookup is
  gated by the same course-owner-or-admin check.
- **Invariant 3 (Import always routes through Review)**:
  `cards/import` still returns candidates only; persistence still
  happens via `cards/batch` after Review confirms.
- **Invariants 2 & 4** (stats privacy / hashes-and-tokens): not
  touched.

## 7. Risks

- **Cross-course `upload_id` collision**: `upload_id`s are UUIDs so
  in practice this can't happen, but the validation must still be
  *course-scoped* (validate the upload exists in *this* `course_id`,
  not globally). RED test #4 in Slice A covers this.
- **Empty-upload race**: an upload "exists" only because at least one
  card carries that `upload_id`. If every card in an upload is deleted
  while the New-card form is open, the selector will show a stale
  option and validation will reject the POST. Acceptable: returns 400,
  user reloads. Not worth a websocket.
- **PDF size**: large PDFs (>10 MB after base64 expansion) may hit
  Functions request-size or Anthropic upload limits. Out of scope to
  fix; document the de-facto cap in the user guide.
- **i18n drift**: three new strings × three locales = nine entries.
  Standard practice in this repo; low risk but easy to forget one.
- **Per-upload action density**: CardManager already has rename + delete
  icons per upload; adding "Add card" + "Import here" makes four. Risk
  of UI clutter on mobile. Mitigation: keep them as small icon buttons
  with `title=` tooltips, same pattern as existing icons.

## 8. Out-of-scope follow-ups

- Move/merge cards across uploads.
- "Re-import this upload" (replace candidates).
- An `uploads` row with metadata (source filename, page count,
  imported-at, original image thumbnail).
- Dedupe: warn when an imported candidate equals an existing card in
  the target upload.
