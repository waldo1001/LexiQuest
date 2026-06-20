# Post-v1 — Never "No cards due": hardest-first fallback queue

## 1. Task

When a course's cards are all learned (nothing due, no new), the study
queue comes back empty and the user sees **"No cards due. Come back
later!"**. Make `buildQueue` **never return an empty queue when the
course has cards** — instead fall back to the cards ordered
**hardest-first by SM-2 ease**, with the easy/mastered ones shuffled in
behind them ("most difficult first, stuffed by random easy ones").

## 2. Scope boundary

**IN**

- `api/src/shared/card-priority.ts` only — the pure queue builder.
- The `cardLimit === null` ("All") path of all four game types
  (`classic`, `boss_round`, `speed_round`, `review_blitz`), which today
  can return `[]` even though cards exist.
- A single shared fallback helper: when the mode's *primary* selection
  is empty and `cards.length > 0`, return a fallback ordering.
- Difficulty signal: **`sm2_ease` ascending only** (card-only, no
  attempts read) — chosen by the user. Ties broken by `sm2_reps` asc,
  then `created_at` asc, then `rowKey`.
- "Random easy ones": cards at the default ease (`sm2_ease >= 2.5`, i.e.
  never-failed) are shuffled among themselves and placed *after* the
  harder cards, via the existing `shuffle` seam in `QueueOptions`.

**OUT (not touched in this slice)**

- No new game type / mode. (User chose "just fix the empty screen".)
- No frontend changes. The "study.empty" screen still legitimately
  shows for a genuinely empty course (0 cards) and for MCQ mode when no
  card has ≥2 distractors — those filters run in `sessions.ts` *before*
  `buildQueue`, so the never-empty guarantee is correctly scoped to
  "non-empty input → non-empty output".
- The numeric-`cardLimit` paths are **unchanged** — they already
  backfill via `backfillWeakest` and are never empty. Their final
  ordering (classic shuffles; speed/boss/review keep priority) is left
  exactly as-is to avoid disturbing working behavior and its tests.
- No attempts-table / struggle-list difficulty metric (deferred — see
  §8).
- No SM-2 / `attempts.ts` changes. Practicing a not-due fallback card
  still re-runs SM-2 as it does today; that is acceptable and aligns
  with "keep practicing".

## 3. Files to create / touch

- **Touch** `api/src/shared/card-priority.ts`
  - Add `fallbackHardestFirst(cards, opts)` helper.
  - Wire it into the `cardLimit === null` branch of `buildClassic`,
    `buildBossRound`, `buildReviewBlitz` (and confirm `buildSpeedRound`
    stays non-empty — it already defaults limit to 50).
- **Touch** `api/src/shared/card-priority.test.ts`
  - Add new RED tests (see §5).
  - Update the existing tests that assert the *old* empty behavior on
    the null path (these intentionally flip):
    - `buildBossRound` › "returns empty when no hard cards exist and
      cardLimit=null" (~:231)
    - `buildBossRound` › "excludes new cards from primary selection (no
      backfill when cardLimit=null)" (~:197/:210) — re-assert that new
      cards now appear via fallback, hardest-first.
    - `buildReviewBlitz` › "excludes new cards from primary selection
      (cardLimit=null)" (~:340/:353)
    - `buildClassic` › "with cardLimit=null does NOT backfill (backward
      compat)" (~:478) and "returns all due + up to 20 new (backward
      compat)" (~:93) — split so the *has-due-cards* case keeps the old
      contract and only the *empty* case falls back.

## 4. Seams involved

- `QueueOptions.shuffle` — the random seam, used to randomize the easy
  tail. No new seam needed.
- `opts.now` — already passed; used by the existing due/new filters.
- No clock/storage/Claude seam changes.

## 5. RED test list

Headline invariant (new `describe("never empty")` block):

1. **classic / null limit / all cards learned → non-empty, hardest
   first.** Given 3 cards all with `reps>0` and `next_review_at` in the
   future, `gameType:"classic", cardLimit:null` returns all 3, ordered
   by `sm2_ease` ascending (lowest ease first).
2. **boss_round / null limit / no hard-due cards → non-empty fallback.**
   Replaces the current `toHaveLength(0)` expectation.
3. **review_blitz / null limit / nothing overdue → non-empty fallback.**
   Replaces the current `toHaveLength(0)` expectation.
4. **speed_round / null limit / all learned → still non-empty**
   (regression guard; already true via the `?? 50` default).
5. **easy tail is shuffled, hard head is ordered.** With a mix of
   low-ease (e.g. 1.3, 1.6) and default-ease (2.5) cards, the low-ease
   cards appear first in ease order; the 2.5 cards appear after and are
   passed through the `shuffle` seam (assert via a deterministic fake
   shuffle, e.g. reverse, as other tests in this file do).
6. **non-empty input ⇒ non-empty output, all 4 game types** (table-style
   loop): for each `gameType` with `cardLimit:null` and a non-empty
   `cards` array where nothing is due, `result.length > 0`.
7. **empty input ⇒ empty output** (the guarantee is conditional): `cards:
   []` still returns `[]` for every game type (so the frontend
   "study.empty" screen still works for truly empty courses).
8. **has-due-cards path unchanged**: classic with `cardLimit:null` and
   some due cards still returns due + ≤20 new in the existing order (no
   regression to the normal case).

## 6. Open questions / assumptions

- **(Decision for approval) Ordering when there ARE some due cards but
  few.** This plan only changes the *empty* case — when the primary pool
  has cards, behavior is untouched (minimal blast radius, matches "just
  fix the empty screen"). If you instead want *every* session padded
  with random-easy filler (always a full deck, even when a few are due),
  that's a larger change to the non-empty path too — say so and I'll
  widen scope.
- **Assumption: "easy" = `sm2_ease >= 2.5`** (the SM-2 default, meaning
  never failed). Cards below 2.5 are treated as "difficult" and ordered;
  2.5-and-up are the shuffled "easy" tail. Adjustable.
- **Assumption: "All" still returns all cards** in the fallback (not a
  capped subset), since the user explicitly picked the "All" option.

## 7. Risks

- **Test churn**: several existing tests assert the old empty behavior
  and will be rewritten (listed in §3). Risk of masking a real
  regression while editing them — mitigated by adding the new invariant
  tests (§5 #6–#8) *first* and keeping the has-due-cards assertions
  intact.
- **Coverage**: `card-priority.ts` is Tier A (90%); it currently sits at
  100%. New branches must stay covered — the §5 list exercises each new
  branch.
- **SM-2 interaction**: practicing not-due cards reschedules them
  (`attempts.ts:89`). Front-loading hardest cards repeatedly is
  intentional here; no scheduler change, so no spacing-corruption beyond
  what already happens when a user re-studies early.
- **Determinism**: the easy tail uses the `shuffle` seam, so production
  randomness is fine and tests stay deterministic via the fake shuffle.

## 8. Out-of-scope follow-ups

- Optionally feed the **struggle-list** metric (fail count from the
  `attempts` table, already computed in `stats-course.ts`) into
  difficulty ordering for a more accurate "hardest" — deferred; needs an
  attempts read at session start.
- Optional dedicated **"Practice / Endless"** game type if the
  always-padded full-session behavior is wanted without changing the
  spaced-repetition modes.
- Optional UI copy nudge on the (now rare) genuinely-empty screen.
