# Post-v1 — Flexible card deletion (with upload grouping)

## 1. Task

Give parents/admins more flexible ways to delete cards from a course:
single-card delete (already exists), **bulk delete by `upload_id`**
(every card created in one AI/photo import goes together), bulk delete
by explicit id list, and "delete all cards in this course". To make the
upload-grouping work, every card created via `POST /api/cards/batch`
must be stamped with a shared `upload_id` at creation time, and the
cards listing must surface that id (plus a human-readable timestamp /
source label) so the UI can group cards by upload.

Single-card manual additions (`POST /api/cards`) remain `upload_id =
null` — they are not part of any upload.

## 2. Scope boundary

### IN

- Add `upload_id: string | null` to `CardRow` and `CardProfile`
  ([api/src/functions/cards-shared.ts](../../api/src/functions/cards-shared.ts)).
- `POST /api/cards/batch`: generate one `upload_id` per request via
  `deps.random.uuid()`, stamp it onto every card created in that
  request, and return it in the response body
  (`{ upload_id, cards: [...] }`).
- `POST /api/cards`: leaves `upload_id = null`.
- New endpoint `DELETE /api/cards/bulk` (or `POST /api/cards/bulk-delete`
  — see Open Questions) accepting one of three mutually-exclusive
  selectors:
  - `{ courseId, uploadId }` — delete every card in `courseId` whose
    `upload_id === uploadId`.
  - `{ courseId, ids: string[] }` — delete the listed card ids from
    that course only.
  - `{ courseId, all: true }` — delete every card in the course.
- Auth: course-owner-or-admin (same rule as `cards-id.ts`). Must NOT
  allow other users to delete via the bulk endpoint.
- `GET /api/cards?courseId=…` returns `upload_id` on each card so the
  frontend can group.
- Frontend `CardManager.jsx`:
  - Group cards by `upload_id` under a collapsible header. Cards with
    `upload_id = null` ("manual") fall under one "Manual" group.
  - Per-upload "Delete this upload" button (with confirm).
  - Multi-select checkboxes per row + "Delete selected" toolbar.
  - "Delete all cards" danger button (with strict confirm).
- i18n strings for the new actions in
  [frontend/src/i18n/strings.js](../../frontend/src/i18n/strings.js).
- Tests for everything new (Tier A 90% on api / lib, Tier B 70% on
  screen).

### OUT (explicit non-goals)

- Storing upload metadata as its own row (e.g. an `uploads` table with
  source image, timestamp, candidate count). The `upload_id` is purely
  a grouping key on cards. **Follow-up candidate.**
- Renaming uploads ("Math homework p.42") in the UI. Today the group
  label is `created_at` of the first card in the group + source.
- Undo / soft-delete / trash bin. Deletes stay hard.
- Restoring a deleted upload from history.
- Stamping `upload_id` retroactively on cards that already exist in
  prod. Existing rows keep `upload_id = null` and appear under
  "Manual"; this is acceptable because the feature is only useful for
  *future* uploads.
- Changing single-card `DELETE /api/cards/{id}` — it stays as is.
- Cascade-delete behavior of attempts when cards go away (already
  handled by Phase 5 slice 3 cascade rules; verify, do not rewrite).

## 3. Files to create / touch

### API

- [api/src/functions/cards-shared.ts](../../api/src/functions/cards-shared.ts)
  — add `upload_id` to `CardRow`, `CardProfile`, `cardProfile()`.
- [api/src/functions/cards-batch.ts](../../api/src/functions/cards-batch.ts)
  — generate one `upload_id`, stamp every created card, include it in
  response body.
- [api/src/functions/cards.ts](../../api/src/functions/cards.ts)
  — manual `POST` writes `upload_id: null`; `GET` already returns full
  profile so picks up the new field automatically.
- [api/src/functions/cards-id.ts](../../api/src/functions/cards-id.ts)
  — preserve `upload_id` on PUT (merge), unchanged behavior on DELETE.
- **NEW** `api/src/functions/cards-bulk-delete.ts` — handler +
  registration. Mirrors `cards-id.ts` for course/owner lookup.
- **NEW** `api/src/functions/cards-bulk-delete.test.ts` — full test
  matrix (see RED list).
- [api/src/functions/cards-batch.test.ts](../../api/src/functions/cards-batch.test.ts)
  — extend with upload_id assertions.
- [api/src/functions/cards.test.ts](../../api/src/functions/cards.test.ts)
  and [cards-id.test.ts](../../api/src/functions/cards-id.test.ts) —
  extend with `upload_id: null` round-trip.
- [api/src/composition-root.ts](../../api/src/composition-root.ts)
  (or wherever functions are registered — verify) — register the new
  bulk-delete function.

### Frontend

- [frontend/src/lib/api.js](../../frontend/src/lib/api.js)
  — add `bulkDeleteCards({ courseId, uploadId? , ids?, all? })`,
  update `batchCreateCards` typing/return shape if it surfaces
  upload_id.
- [frontend/src/lib/api.test.js](../../frontend/src/lib/api.test.js)
  — cover the three selector shapes + error paths.
- [frontend/src/screens/CardManager.jsx](../../frontend/src/screens/CardManager.jsx)
  — grouping, per-upload delete, multi-select, delete-all.
- [frontend/src/screens/CardManager.test.jsx](../../frontend/src/screens/CardManager.test.jsx)
  — cover grouping + each delete path + auth-guard (non-owner sees no
  delete buttons).
- [frontend/src/i18n/strings.js](../../frontend/src/i18n/strings.js)
  — keys: `cards.group.manual`, `cards.group.upload`,
  `cards.action.deleteUpload`, `cards.action.deleteSelected`,
  `cards.action.deleteAll`, `cards.confirm.deleteUpload`,
  `cards.confirm.deleteAll`, `cards.status.bulkDeleted`.

### Docs

- [docs/changelog.md](../../docs/changelog.md), [docs/user-guide.md](../../docs/user-guide.md)
  via `/docs-update` at the end of the slice.

## 4. Seams involved

- `Random` — `random.uuid()` for the new `upload_id` in
  `cards-batch.ts`.
- `Clock` — already used; nothing new.
- `TableStorage` — bulk delete is N sequential `tables.remove()` calls
  filtered by query first. No new seam method needed; we list the
  partition (course_id) and filter in-memory by `upload_id` /
  membership / always.
- `SessionSigner` — owner-or-admin check via `requireAuth`, identical
  to existing card endpoints.
- No new seams. (Important — keep the surface small.)

## 5. RED test list

### API — `cards-batch.test.ts` (extension)

1. `creates one upload_id and stamps it on every card in the batch`
2. `each call generates a fresh upload_id (random.uuid called once per request)`
3. `response body includes upload_id alongside the created cards`
4. `single-card POST /api/cards stores upload_id = null`

### API — `cards-bulk-delete.test.ts` (new)

5. `405 on GET / PUT / PATCH`
6. `401 when no session`
7. `400 when courseId missing`
8. `400 when none of {uploadId, ids, all} is provided`
9. `400 when more than one selector is provided`
10. `400 when ids is empty array`
11. `404 when courseId does not exist`
12. `403 when caller is not owner and not admin`
13. `by uploadId: deletes only cards whose upload_id matches; leaves others`
14. `by uploadId: deleting an unknown uploadId returns 200 with deleted=0 (idempotent), not 404`
15. `by ids: deletes only listed ids in this course; ignores ids that belong to a different course (does not delete them, returns deleted=count-actually-deleted)`
16. `by all: deletes every card in the course`
17. `admin can bulk-delete from a course they don't own`
18. `owner can bulk-delete from their own course`
19. `response shape: { deleted: number }`
20. **Auth boundary meta**: caller's `userId` is read from session, body's `userId` (if injected) is ignored. (Add to existing `api/__meta__/auth-boundary.test.ts`.)

### Frontend — `lib/api.test.js`

21. `bulkDeleteCards posts the right payload for each selector`
22. `bulkDeleteCards throws on non-2xx`

### Frontend — `CardManager.test.jsx`

23. `groups cards by upload_id with manual cards under "Manual"`
24. `shows "Delete this upload" only on non-manual groups`
25. `clicking "Delete this upload" → confirms → calls bulkDeleteCards({uploadId}) → removes group from list`
26. `multi-select checkboxes + "Delete selected" calls bulkDeleteCards({ids})`
27. `"Delete all" requires confirm and calls bulkDeleteCards({all:true})`
28. `non-owner / non-admin sees no bulk-delete UI (only read)`
29. `error path: API failure shows error and leaves list intact`

## 6. Open questions / assumptions

- **HTTP shape of bulk delete** — `DELETE /api/cards/bulk` with a JSON
  body, or `POST /api/cards/bulk-delete`? Azure Functions + SWA route
  table both support DELETE-with-body, but some HTTP intermediaries
  strip it. **Default assumption: `POST /api/cards/bulk-delete`**
  (safer, idempotent semantics enforced server-side). Confirm before
  RED.
- **Upload label**: we don't store source-image / timestamp / origin
  per-upload. Display label = `created_at` of the earliest card in
  the group + count, e.g. `Upload — 2026-04-25 14:02 (12 cards)`.
  Acceptable for v1.
- **Existing rows have no `upload_id`** — Table Storage tolerates a
  missing column; reads return `undefined`, which `cardProfile` will
  coerce to `null`. No migration script. Verify in a test.
- **Concurrency** — two parents bulk-deleting the same course at once
  is fine; `tables.remove()` is idempotent on 404. No locking needed.
- **Cascade to attempts** — Phase 5 slice 3 already removes attempts
  when their card disappears. Verify the bulk path also triggers
  this; if cascade is colocated with single-card delete it must be
  reused, not duplicated.

## 7. Risks

- **Forgetting auth on the new bulk endpoint** — easy mistake to leak
  course data. Mitigation: explicit auth-boundary meta test (#20),
  same `findCourseById` pattern as `cards-id.ts`.
- **Accidentally deleting the wrong course's cards via stale
  `upload_id` collisions** — `upload_id` is a UUID, collision odds
  are negligible, but the handler still scopes deletion by `courseId`
  partition. Test #13 + #15 enforce the scope.
- **UI confirm-fatigue** — three different delete buttons. Keep
  copy specific: "Delete this upload? 12 cards will be removed." vs
  "Delete ALL cards in this course?". Use the existing `confirmFn`
  injection so tests stay deterministic.
- **`cardProfile` shape change** is technically a breaking response
  change. Mitigation: additive only (new optional field, never
  removed). Frontend tolerates absent `upload_id`.
- **Coverage drift on `CardManager.jsx`** — it's a Tier B screen, so
  70% suffices, but the new branches push complexity up. Plan to
  extract group-building into a small pure helper if the screen
  itself starts dropping below 70%.

## 8. Out-of-scope follow-ups

- A real `uploads` table row keyed by `upload_id` with
  `{ source: "photo"|"ai_import", created_at, image_blob_ref?,
   candidate_count, accepted_count }` so the UI can show "Math
  homework p.42 — imported 25 Apr". Today's label is timestamp-based
  and good enough.
- Renaming an upload (custom label).
- Soft-delete / trash bin / undo window.
- Backfill existing rows with synthetic per-day `upload_id`s.
- Bulk delete by source (`"manual" | "photo" | "ai_import"`) — easy
  to add later as a fourth selector if anyone asks.
- Bulk delete across courses (admin tool).

---

**Status**: awaiting user approval. No FRAME, RED, or code until the
plan is acknowledged. After approval I'll resolve the one open
question (DELETE-with-body vs POST bulk-delete) before writing the
RED list.
