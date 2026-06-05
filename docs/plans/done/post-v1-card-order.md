# Post-v1 — Card order option (random default / sequential)

## 1. Task

Add a per-session **card order** option — questions presented in random
order by default, with a "sequential" choice that presents them in the
order of the cards (deck/insertion order).

## 2. Scope boundary

**IN**

- New axis `cardOrder: "random" | "sequential"`, default `"random"`.
- API: thread `cardOrder` through `validateSessionCreate` → `QueueOptions`
  → `buildQueue`. When `sequential`, the **classic** queue is returned in
  deck order (no shuffle) instead of shuffled.
- API: persist `card_order` on the session row and surface it on
  `SessionProfile` (legacy rows default to `"random"`).
- Frontend: a card-order picker on `SessionSetup` (Random / In order),
  default Random, threaded through navigation state → `StudySession` →
  `startSession` body.
- i18n labels for the new control.

**OUT (deferred / not this slice)**

- Applying `cardOrder` to `boss_round`, `speed_round`, `review_blitz`.
  Those modes have a *deliberate* non-random order (difficulty / priority
  / overdue-first); "sequential" would undermine their purpose. They
  accept the field but ignore it. (See Open question Q1.)
- Persisting card order as a per-course or per-user default preference
  (it is chosen per session, like `gameType`/`cardLimit`).
- Any change to card *selection* (which cards, due vs new, cardLimit).
  `cardOrder` only changes *presentation order* of the selected set.
- Re-ordering MCQ answer buttons (already shuffled independently).

## 3. Files to create / touch

**API (Tier A — 90%)**

- `api/src/shared/card-priority.ts` — add optional `cardOrder` to
  `QueueOptions` (default `"random"`); in `buildClassic`, branch between
  `opts.shuffle(...)` and a new `orderByDeck(...)` helper.
- `api/src/shared/card-priority.test.ts` — new tests.
- `api/src/functions/sessions-shared.ts` — add `cardOrder` to
  `SessionCreateBody` + validation; add `card_order` to `SessionRow` and
  `SessionProfile`; map it in `sessionProfile` (legacy default).
- `api/src/functions/sessions-shared.test.ts` — new tests.
- `api/src/functions/sessions.ts` — pass `cardOrder` into `buildQueue`,
  persist `card_order` on the row.
- `api/src/functions/sessions.test.ts` — new test.

**Frontend (Tier B screens — 70%; Tier A lib — 90%)**

- `frontend/src/screens/SessionSetup.jsx` — card-order picker + nav state.
- `frontend/src/screens/SessionSetup.test.jsx` — new tests.
- `frontend/src/screens/StudySession.jsx` — read `cardOrder` from
  `location.state`, add to `startSession` body when `sequential`.
- `frontend/src/screens/StudySession.test.jsx` — new test (body shape).
- `frontend/src/i18n/*` — new label keys (`setup.cardOrder`,
  `setup.cardOrder.random`, `setup.cardOrder.sequential`).
- `frontend/src/lib/api.js` — **no change** (`startSession` forwards the
  body verbatim).

## 4. Seams involved

- **random** — `shuffle` is the existing seam; the `sequential` path
  deliberately does *not* call it. Tests use `FakeRandom`
  (`api/testing/fake-random.ts`).
- **tables**, **clock**, **signer** — already wired in `sessions.test.ts`
  via existing fakes; unchanged.

## 5. RED test list

### `api/src/shared/card-priority.test.ts`

- AC1: classic + `cardOrder:"sequential"` returns the selected set in
  ascending `created_at` order and never calls `shuffle`.
  - test name: `"classic with cardOrder 'sequential' returns selected cards in created_at order without shuffling"`
  - seams: random (shuffle must NOT be invoked — assert via deck order +
    a FakeRandom with no scripted shuffles)
  - edge: mixed `created_at` values out of input order.
- AC2: classic + `cardOrder:"random"` still shuffles (regression).
  - test name: `"classic with cardOrder 'random' shuffles the selected set as before"`
  - seams: random (scripted permutation applied).
- AC3: `cardOrder` omitted from `QueueOptions` defaults to random
  (back-compat for existing callers/tests).
  - test name: `"buildQueue defaults to random order when cardOrder is omitted"`
- AC4: sequential deck order breaks equal `created_at` ties by `rowKey`
  ascending (stable, deterministic).
  - test name: `"sequential order breaks created_at ties by card id ascending"`
  - edge: two cards with identical `created_at`.

### `api/src/functions/sessions-shared.ts`

- AC5: `validateSessionCreate` accepts `cardOrder:"sequential"`.
  - test name: `"accepts cardOrder 'sequential'"`
- AC6: `validateSessionCreate` defaults `cardOrder` to `"random"` when
  omitted.
  - test name: `"defaults cardOrder to 'random' when omitted"`
- AC7: `validateSessionCreate` rejects an invalid `cardOrder`.
  - test name: `"rejects cardOrder that is not random or sequential"`
  - edge: `cardOrder: "shuffled"`.
- AC8: `sessionProfile` surfaces `card_order`, defaulting to `"random"`
  for legacy rows missing the field.
  - test name: `"sessionProfile defaults card_order to 'random' for legacy rows"`

### `api/src/functions/sessions.test.ts`

- AC9: the handler threads `cardOrder` into the queue and persists
  `card_order` on the session row.
  - test name: `"sequential cardOrder yields a deck-ordered queue and persists card_order on the session row"`
  - seams: tables, clock, random (FakeRandom with no shuffle scripted for
    the sequential case).

### `frontend/src/screens/SessionSetup.test.jsx`

- AC10: renders a card-order picker defaulting to Random.
  - test name: `"renders card-order picker with Random selected by default"`
- AC11: choosing "In order" forwards `cardOrder:"sequential"` in nav
  state on Start.
  - test name: `"passes cardOrder 'sequential' in navigation state when In order is chosen"`

### `frontend/src/screens/StudySession.test.jsx`

- AC12: when `location.state.cardOrder === "sequential"`, the
  `startSession` body includes `cardOrder:"sequential"`.
  - test name: `"includes cardOrder 'sequential' in the start-session body"`
  - edge: default (random) omits the field, matching the existing
    `gameType !== "classic"` pattern.

## 6. Open questions / assumptions

- **Q1 (scope across game types).** *Assumption:* `cardOrder` affects only
  the `classic` game type this slice; `boss_round` / `speed_round` /
  `review_blitz` keep their deliberate ordering and ignore the field.
  Confirm, or should "sequential" force deck order for every game type?
- **Q2 (meaning of "order of the cards").** *Assumption:* deck order =
  ascending `created_at` (insertion order), tie-broken by card id
  (`rowKey`). This matches the order cards were added/imported. Confirm vs.
  e.g. the order shown in the card-management list.
- **Q3 (persistence).** *Assumption:* store `card_order` on the session
  row (like `game_type`), for history/stats consistency. Not exposed as a
  saved per-course default. Confirm.

## 7. Risks

- **Back-compat of `QueueOptions`.** Existing `buildQueue` callers/tests
  pass no `cardOrder`. Mitigation: make it optional, default `"random"`;
  AC3 guards this.
- **Legacy session rows** lack `card_order`. Mitigation: `sessionProfile`
  defaults to `"random"` (same defensive pattern already used for
  `game_type`/`card_limit`); AC8 guards this.
- **Coverage dip** on `card-priority.ts` (Tier A 90%) if the new branch is
  under-tested. Mitigation: AC1–AC4 cover both branches + tie edge.
- Rollback = revert the slice commit; no storage migration needed (new
  field is additive and optional on read).

## 8. Out-of-scope follow-ups

- Per-course / per-user "remember my card-order choice" default.
- Extending sequential ordering to the three challenge game types (pending
  Q1).
- Surfacing `card_order` in the session history / stats UI.
