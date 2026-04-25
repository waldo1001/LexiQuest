# Phase 17 — Bidirectional cards (5 slices)

## Task
Make LexiQuest study cards bidirectional. A card imported as French→Dutch should also be studied Dutch→French. Both directions live as independent rows so SM-2 schedules each on its own merit. Cover three entry points: existing courses (one-shot), new imports (per-batch), and ongoing manual creation (course default).

## Why now
You imported a French course from a photo and only got one direction. Manually re-typing 40 reverse cards is the wrong fix; the app should know. Bidirectional study also matches how language learning actually works — recognition (read French, recall Dutch) is a different skill from production (read Dutch, recall French).

## Architecture decision (cross-cutting)

Reverse cards are stored as **separate rows**, not flipped on the fly. Rationale:
- SM-2 must schedule each direction independently — recognition can be easy while production is still hard.
- Attempts, stats, mastery distribution all key on `card.id` — flipping at study time would conflate two distinct memory traces.
- A `reverse_of: string | null` pointer on `CardRow` gives idempotency, future visual pairing, and lets the reverse exist without touching the forward.

`CardSource` gains `"reverse"`. Pipe-split rule: `"le chien|le chiot" → "the dog"` reverses to `"le chien" → "the dog"` (first alternative is the reverse question; original question is the unique reverse answer). Hints and distractors do **not** carry over. The user can hit `/api/cards/enrich` after to get MCQ distractors on the new reverses.

---

## Slice 1 — Schema + pure reverse builder

Groundwork. No user-visible change yet, but all later slices depend on it. Smallest possible diff.

### Scope
**IN**
- `CardRow.reverse_of: string | null` field added.
- `CardSource` union extended with `"reverse"`.
- `cardProfile()` exposes `reverse_of` (defaults to `null` when absent on legacy rows — read path uses `?? null`).
- Pure helper `buildReverseCard(forward: CardRow, opts: { id, nowIso }): CardRow` in `cards-shared.ts`. Pipe-split, fresh SM-2, hint/distractors empty, `source="reverse"`, `reverse_of=forward.rowKey`.
- All existing call sites that construct a `CardRow` updated to include `reverse_of: null` (cards.ts, cards-batch.ts, attempts.ts, cards-id.ts merging path, cards-import.ts if it constructs rows).

**OUT**
- Endpoints, UI, course flag — slices 2/3/4.

### Files
- `api/src/functions/cards-shared.ts` (modify)
- `api/src/functions/cards-shared.test.ts` (extend)
- `api/src/functions/cards.ts`, `cards-batch.ts`, `cards-id.ts`, `attempts.ts`, `cards-import.ts` (one-line change each — add `reverse_of: null`)

### Seams
none.

### RED list
- `cardProfile exposes reverse_of, defaulting to null when absent`
- `buildReverseCard swaps Q/A and uses fresh SM-2`
- `buildReverseCard splits pipe-alternatives and uses the first as the new question`
- `buildReverseCard sets source="reverse" and reverse_of=forward.rowKey`
- `buildReverseCard nulls hint and distractors`

### Done when
- Full api suite green.
- `CardRow` everywhere compiles with the new field.
- `buildReverseCard` is exported and unit-tested.

---

## Slice 2 — `POST /api/cards/reverse` + Card Manager button

The "fix it now" path for the courses you already imported.

### Scope
**IN**
- Endpoint `POST /api/cards/reverse` body `{ courseId }`. Returns `{ created, skipped }`.
- Auth: course owner or admin. 401/403/404 paths.
- Idempotent: builds a `Set` of `reverse_of` values across the course's cards; for every forward card whose id is not in the set, creates a reverse via `buildReverseCard`. Cards that are themselves reverses (`reverse_of !== null`) are skipped.
- Frontend: `reverseCards(courseId)` wrapper in `lib/api.js`.
- Card Manager: "Add reverse cards" button gated by `canEdit`. Shows status "Added N reverse cards" or "All cards already have reverses".
- i18n keys EN + NL.

**OUT**
- Editing the reverse together with the forward (slice 5 — see Phase 18 ideas).
- Per-card "reverse just this one" action (out of scope; bulk action is enough).

### Files
- `api/src/functions/cards-reverse.ts` (new)
- `api/src/functions/cards-reverse.test.ts` (new)
- `api/src/index.ts` (register)
- `frontend/src/lib/api.js` + `.test.js`
- `frontend/src/screens/CardManager.jsx` + `.test.jsx`
- `frontend/src/i18n/strings.js`

### Seams
tables, signer, clock, random.

### RED list
- `returns 401 when no session cookie`
- `returns 404 when course not found`
- `returns 403 when caller is neither owner nor admin`
- `creates a reverse card for each forward card and returns counts`
- `is idempotent: second invocation creates 0, skips all`
- `reverses 'le chien|le chiot' → 'the dog' as 'le chien' → 'the dog'`
- `does not reverse a card that is already a reverse`
- `reverse rows have source='reverse', reverse_of=<forwardId>, distractors=[], hint=null, fresh SM-2 state`
- frontend: `reverseCards posts courseId and returns { created, skipped }`
- frontend: `reverseCards throws on non-2xx`
- screen: `shows 'Add reverse cards' for course owner`
- screen: `hides 'Add reverse cards' for read-only viewer`
- screen: `clicking 'Add reverse cards' calls the API, refreshes, shows status`

### Done when
- Hitting the button on your French course creates 40 reverse rows; second click creates 0, says "All cards already have reverses".
- Studying that course now serves both directions.

---

## Slice 3 — Bidirectional toggle on Import Review

Future imports are bidirectional from day one without a separate click.

### Scope
**IN**
- `POST /api/cards/batch` accepts an optional `bidirectional: boolean` flag at the body root. When true, for every card in the request the handler creates the forward AND the reverse (using `buildReverseCard`). Response shape unchanged (`cards: CardProfile[]`) — both forward and reverse are in the array; the caller can tell them apart by `reverse_of`.
- Import Review screen: checkbox "Also create reverse cards" above the cards table. Default-on when the course has a `language` set and that language is not the user's UI language. Default-off otherwise.
- The checkbox state is sent as `bidirectional` in the batch payload.

**OUT**
- Course-level default — slice 4.
- Reverse-side distractors — user can run `/api/cards/enrich` afterwards.

### Files
- `api/src/functions/cards-batch.ts` (modify)
- `api/src/functions/cards-batch.test.ts` (extend)
- `frontend/src/screens/ImportReview.jsx` (modify)
- `frontend/src/screens/ImportReview.test.jsx` (extend)
- `frontend/src/i18n/strings.js` (new keys)

### Seams
tables, signer, clock, random.

### RED list
- batch: `creates only forward cards when bidirectional is false or omitted` (regression guard for current behavior)
- batch: `creates a forward + reverse pair for each input when bidirectional=true`
- batch: `bidirectional=true response includes both forward and reverse profiles`
- batch: `pipe-alternative rule applies on the reverse`
- screen: `shows 'Also create reverse cards' checkbox on Import Review`
- screen: `defaults checkbox on when course.language differs from user.ui_language`
- screen: `defaults checkbox off when course has no language`
- screen: `submits bidirectional=true to /api/cards/batch when checkbox ticked`

### Done when
- A new photo import on the French course produces forward + reverse for every selected card in one go, no second click.

---

## Slice 4 — Course-level `bidirectional` default

Manually-added cards (not imports) also spawn reverses, when the course is set up that way.

### Scope
**IN**
- `CourseRow.bidirectional: boolean` field. Defaults to `false`.
- Course create / edit form: a checkbox "Cards study both directions" (label TBD per question 1).
- `POST /api/cards` (single-card create): when the parent course has `bidirectional=true`, the handler also creates the reverse. Response returns the forward only (matches existing single-card response shape) — the reverse is silently created and the user sees both in the next list refresh.
- Course-list / course-edit UI exposes the toggle.

**OUT**
- Bulk-flip "make all my courses bidirectional" — manual per course.
- Auto-creating reverses when `bidirectional` is flipped from `false → true` on an existing course. The user runs the slice-2 "Add reverse cards" button for that.

### Files
- `api/src/functions/courses-shared.ts` (extend `CourseRow` + validators)
- `api/src/functions/courses.ts`, `courses-id.ts` (handle the field on create/patch)
- `api/src/functions/cards.ts` (when course.bidirectional, also `buildReverseCard` and upsert)
- `api/src/functions/cards.test.ts` (RED list)
- `frontend/src/screens/CourseList.jsx` (toggle in form)
- `frontend/src/screens/CourseList.test.jsx` (RED list)
- `frontend/src/i18n/strings.js`

### Seams
tables, signer, clock, random.

### RED list
- course: `course create accepts bidirectional flag, defaults to false`
- course: `course patch can flip bidirectional from false to true and back`
- card: `POST /api/cards spawns a reverse when parent course is bidirectional`
- card: `POST /api/cards does not spawn a reverse when parent course is not bidirectional`
- screen: `course form shows a 'Cards study both directions' checkbox`
- screen: `submitting the form persists the bidirectional value`

### Done when
- A course marked bidirectional auto-pairs every new card you add manually. Existing cards untouched.

---

## Slice 5 — Card Manager pairing UI + linked delete

So you don't see the same word twice as if they were unrelated.

### Scope
**IN**
- Card Manager: each row shows a small "↔" badge when the card has a partner (either it has `reverse_of`, or another card in the list has it as `reverse_of`).
- Hover/tap on the badge: "Reverse of: <forward question>" or "Has reverse: <reverse question>" tooltip.
- Delete behavior: when deleting a forward card that has a reverse, prompt "Also delete the reverse?". Default Yes. Same when deleting a reverse — prompt "Also delete the forward?". Default No (the forward is the canonical card).
- Edit behavior unchanged — editing one side does NOT propagate to the other in this slice. (Edits on the forward could go stale on the reverse, but that's OK: the user can re-run "Add reverse cards" + delete the stale ones, or we tackle propagation in a future slice.)

**OUT**
- Side-by-side editor.
- Auto-propagation of edits.
- A "swap which is forward" action.

### Files
- `frontend/src/screens/CardManager.jsx`
- `frontend/src/screens/CardManager.test.jsx`
- `frontend/src/i18n/strings.js`

### Seams
none. Pure UI on data already returned by `/api/cards/by-course`.

### RED list
- `shows ↔ badge on cards that have a reverse partner`
- `shows ↔ badge on reverse cards`
- `does not show ↔ badge on standalone cards`
- `tooltip on badge names the partner question`
- `deleting a forward with a reverse asks 'also delete reverse?' (default yes)`
- `deleting a reverse with a forward asks 'also delete forward?' (default no)`
- `confirming the linked delete deletes both rows`
- `declining the linked delete deletes only the chosen row`

### Done when
- Visiting Card Manager on a bidirectional course shows clear pairing; deleting handles the link safely.

---

## Cross-cutting open questions

1. **Toggle wording.** "Cards study both directions" / "Make bidirectional" / "Reverse cards too" / "Both directions" — which feels right? Plan currently uses literal "Add reverse cards" / "Cards study both directions" / "Also create reverse cards". Confirm or replace.
2. **Hints copy-over.** Plan: hints stay forward-only (a French hint like "masculine noun" doesn't fit the Dutch→French direction). Confirm.
3. **Distractor enrichment for reverses.** Plan: not auto. User runs `/api/cards/enrich` after. Confirm — or want a "reverse + enrich" combo button?
4. **Default for slice 3 checkbox.** Plan: default-on when `course.language` is not the user's `ui_language`. Confirm — or prefer always-on, or always-off-but-remembered-per-course?
5. **Linked-delete defaults (slice 5).** Plan: deleting forward → "delete reverse too?" default Yes. Deleting reverse → "delete forward too?" default No. Confirm or flip.

## Risks

- **Schema-add-everywhere blast radius**. Adding `reverse_of` to `CardRow` and `bidirectional` to `CourseRow` touches every place those rows are constructed. Slice 1 isolates the card-side change; the course-side ripple lands inside slice 4. Pre-existing tests catch missed call sites.
- **Idempotency edge case**: a user manually adds a card with the same Q/A as an existing reverse. Slice-2 idempotency uses the `reverse_of` set, so the user's manual duplicate is left alone — correct behavior, but worth knowing.
- **Edit drift**: editing a forward does not propagate to the reverse. Acceptable for now (slice 5 calls this out); future slice can add propagation if it bites.
- **Test churn**: Tier B 70% on screens means a few new tests per UI-touching slice; Tier A 90% on api means each new endpoint or branch needs a test.

## Out-of-scope follow-ups (Phase 18+)

- Edit propagation between paired cards.
- "Swap which is forward" action.
- Auto-enrich reverses (combine reverse + enrich in one API call).
- Bulk "make all my courses bidirectional".
- Study-mode UX hint when a reverse is missed: "you also have the forward — review it next?"
- Pair-aware mastery stats: a "pair mastered" badge when both directions cross the threshold.

## Estimate

Five slices, all small. Slice 1 is groundwork (~30 min). Slices 2–4 are each one endpoint + one UI change (~1–1.5h each). Slice 5 is pure UI polish (~45 min). End-to-end: half a focused day if we run autonomous, with one commit per slice.
