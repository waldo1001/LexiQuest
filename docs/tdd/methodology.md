# TDD Methodology — LexiQuest

This is the workflow. Every code change follows it. No exceptions for "trivial"
changes — trivial changes are exactly where skipped tests accumulate into
untested surface area.

---

## 1. Why TDD here specifically

LexiQuest is the study app for three kids and the platform their learning runs
on. A regression isn't "a failing button" — it's "Mats's French streak was lost
on the day of his test", "SM-2 rescheduled a card he never saw", or "the AI
import silently saved wrong answers he then memorized". A memorized wrong
answer is worse than no card at all. The cost of a bug is measured in study
time the family cannot get back.

Secondary reason: this codebase will be maintained partly by Claude across
sessions with no shared memory. Tests are the contract Claude-next reads to
understand what Claude-now intended. If a behavior isn't in a test, it
effectively does not exist.

---

## 2. The cycle

```
PLAN → FRAME → RED list → PROVE RED → SCAFFOLD → GREEN → REFACTOR → COVER → SECURITY SCAN → UPDATE DOCS → REVIEW
```

### 2.-1 PLAN — write a plan file, stop, wait for approval

**Non-negotiable, before anything else.**

Write a markdown plan file at `docs/plans/phase-<N>-slice-<M>-<short-name>.md`
(e.g. `docs/plans/phase-2-slice-1-table-client.md`) with these sections:

1. **Task** — one sentence.
2. **Scope boundary** — what is IN this slice and what is explicitly OUT.
   Be ruthless: a slice is one TDD cycle, not a phase.
3. **Files to create / touch** — exact paths under `api/` or `frontend/`.
4. **Seams involved** — tables | claude | clock | hasher | signer | random |
   logger | tts | fetch | none.
5. **RED test list** — draft (see §2.1 for format).
6. **Open questions / assumptions** — each entry is either a question for the
   user or a stated assumption flagged for confirmation.
7. **Risks** — what could go wrong, what would force a rollback.
8. **Out-of-scope follow-ups** — things this plan deliberately defers, so
   they don't get lost.

After writing the file, **post its path in chat and stop**. Do not proceed
to FRAME until the user explicitly approves ("go", "approved", "looks
good", "yes proceed"). Silence is not approval.

If the user requests changes, edit the plan file and re-ask. Never start
FRAME / RED / code from an unapproved plan.

### 2.0 FRAME — situate the step in the project (≤150 words)

Before the RED list, before any code, post a short framing in chat that
answers all four questions. **Hard cap: 150 words total.**

1. **Goal of this step** — what we are creating, one sentence.
2. **Where it stands in the project** — which phase from
   [../../PROGRESS.md](../../PROGRESS.md), which prior steps it builds on,
   what comes after.
3. **Why it is needed** — what breaks or is missing without it.
4. **What it contributes** — which piece of the architecture or design in
   [../../Design.md](../../Design.md) it advances, or which API endpoint,
   screen, or seam it unlocks.

The framing keeps both the user and Claude grounded in the bigger picture,
and catches "wait, why are we doing this?" moments before the RED list
locks the work in.

### 2.1 RED list — enumerate tests before touching code

Before *any* production code or even test code, post the RED list. For each
requirement derived from the task:

- name the behavior in one sentence
- name the test file it will live in
- name the seams it touches
- call out edge cases explicitly (empty input, date-range boundary, unicode
  in card content, pipe-separated alternatives, SM-2 quality=0 edge, timezone
  rollover at midnight Europe/Brussels, Claude JSON wrapped in markdown fences,
  cookie missing/expired, unauthorized cross-user write)

If a requirement isn't on the list, it won't get tested, and if it doesn't get
tested it doesn't get built.

### 2.2 PROVE RED — make the failure meaningful

After writing the first failing test:

1. Run *only that test file* — never start by running the whole suite.
2. Read the failure message. It must be about the behavior under test
   (`expected 3 received undefined`), not plumbing (`Cannot find module`,
   `is not a function`, `ReferenceError`).
3. If the failure is plumbing, go to **SCAFFOLD** and come back.
4. If the failure is meaningful, you have a true RED. Only now may you write
   implementation.

A test that has *never* been observed to fail for the right reason is not a
test. It's a placeholder that will silently pass on a bug some day.

### 2.3 SCAFFOLD — make the code testable before making it work

Minimum shape so the test reaches the assertion:

- files, module exports, type signatures (TS) or JSDoc param/return tags (JS),
  DI parameters
- a stub implementation that throws `new Error("not implemented: <name>")` or
  returns a typed zero value
- fakes/mocks for the seams the test touches (see
  [testability-patterns.md](testability-patterns.md))

Scaffold is not implementation. Scaffold is "the shape of the implementation".
The test should now fail with an assertion error, not a structural error.

**Rule of thumb**: if scaffolding feels hard, the design is wrong. A unit
that's hard to stand up in a test is hard to reason about in production. Stop
and redesign the seams before continuing.

### 2.4 GREEN — minimum code to pass

Write the *simplest* implementation that makes the test pass. Not the
prettiest, not the most general. Resist the urge to implement the next test
case "while you're here" — that's how you end up with untested code that
accidentally works.

### 2.5 REFACTOR — clean up under the safety net

Only with all tests green:

- rename for clarity
- extract helpers where duplication is real (not speculative)
- tighten types
- delete dead code and dead comments
- run the full suite after each meaningful change; revert if it goes red

### 2.6 COVER — enforce thresholds + requirement traceability

See [coverage-policy.md](coverage-policy.md) for the split thresholds
(90% on `api/` and `frontend/src/lib/`, 70% on `frontend/src/screens/` and
`frontend/src/components/`).

Two checks, both required:

1. **Mechanical**: Vitest coverage reports ≥ threshold on every file you
   touched. Below threshold = keep writing tests.
2. **Semantic**: every acceptance criterion on the task maps to at least one
   named test. Write the mapping as a bullet list in the PR / commit message:

   ```
   - AC1 "failed cards reschedule to tomorrow" → api/shared/sm2.test.ts: "on quality 0, interval resets to 1 day and reps to 0"
   - AC2 "MCQ falls back to self-grade when distractors missing" → frontend/src/screens/StudySession.test.jsx: "card without distractors in mcq mode renders self-grade controls"
   ```

   Mechanical coverage without semantic coverage is how you end up 95%-covered
   on the wrong thing.

### 2.7 SECURITY SCAN — no leak, no exception

Before docs, before review, run the `/security-scan` skill
([.claude/skills/security-scan/SKILL.md](../../.claude/skills/security-scan/SKILL.md)).

It scans for: tracked sensitive files, secrets in source, bcrypt hashes and
session tokens in logs/fixtures/snapshots, real family member details outside
allowlisted docs, and `npm audit` high/critical findings once the projects
exist.

A finding **blocks** the cycle. Never "note and continue".

### 2.75 UPDATE DOCS — the changelog is not optional

Before REVIEW, run the `/docs-update` skill
([.claude/skills/docs-update/SKILL.md](../../.claude/skills/docs-update/SKILL.md)).
Every task updates at least [docs/changelog.md](../changelog.md).
User-visible changes also update [setup.md](../setup.md),
[getting-started.md](../getting-started.md), and/or
[user-guide.md](../user-guide.md).

Documentation not updated at the moment of the change is never updated.

### 2.8 REVIEW — the self-review checklist

Before marking a task done, answer all of these. "Yes" to every one, or go
back:

- [ ] Did I write and get approval on the PLAN before anything else?
- [ ] Did I post the FRAME (≤150 words, all four questions) before the RED
      list?
- [ ] Did I run `/security-scan` with a PASS result?
- [ ] Did I run `/docs-update` and update the changelog (plus any user-visible
      sections) as the last step before this review?
- [ ] Did I write the RED list before production code?
- [ ] Did I observe every new test fail with a *meaningful* error before making
      it green?
- [ ] Is every seam (tables, Claude, clock, hasher, signer, random, logger,
      fetch, TTS) injected rather than imported, so the unit under test is
      isolatable?
- [ ] Does the server endpoint derive `user_id` from the session cookie, never
      from the request body? (See LexiQuest invariant §4.)
- [ ] Do stats endpoints return aggregates only, never raw attempts of other
      users? (See LexiQuest invariant §4.)
- [ ] Does the AI import flow route every candidate card through the Import
      Review screen before persistence? (See LexiQuest invariant §4.)
- [ ] Is coverage ≥ threshold for the file's tier on touched files?
- [ ] Does every acceptance criterion trace to a named test?
- [ ] Did I run the *full* suite, not just the touched file, to catch
      cross-module regressions?
- [ ] Are there any `.only`, `.skip`, `xit`, or commented-out tests? (None
      allowed on main.)
- [ ] Are there any bcrypt hashes, session tokens, real family data, or
      real tenant identifiers in fixtures or snapshots? (None allowed.)

---

## 3. What is a unit, what is an integration test

- **Unit test** — one module, all seams faked. Fast (<10ms). Lives beside the
  source file as `<name>.test.ts` (api) or `<name>.test.jsx` / `.test.js`
  (frontend). This is where the bulk of coverage comes from.
- **Integration test** — multiple real modules wired together with a real
  in-process fake of Table Storage (Map-backed) and a stub Claude client.
  Lives in `api/**/__integration__/`. Slower but still no network.
- **Contract test** — runs a shared assertion suite against both the real
  Table Storage client (against Azurite) and the in-memory fake, ensuring the
  fake does not drift. Lives in `api/**/__contract__/`.
- **Smoke test** (manual, not automated) — once per phase milestone, boot
  via `swa start`, run one real study session, eyeball rows in Storage
  Explorer. Not part of CI.

Unit tests are mandatory. Integration and contract tests are added at the
moment they would have caught a real bug.

---

## 4. Test naming

Test names are specs. They read left-to-right as English.

```ts
describe("applySm2", () => {
  it("on quality 0, resets reps to 0 and schedules review tomorrow", ...);
  it("on quality 5 after reps=0, schedules review in 1 day", ...);
  it("on quality 5 after reps=1, schedules review in 6 days", ...);
  it("on quality 5 after reps>=2, multiplies interval by ease", ...);
  it("never lets ease drop below 1.3", ...);
});
```

Bad names: `"works"`, `"test1"`, `"handles errors"`. These tell future Claude
nothing and will be deleted or rewritten on the next pass.

---

## 5. Fixtures

- Fixtures live in `api/**/__fixtures__/` and `frontend/src/**/__fixtures__/`.
- Fixtures are *synthetic*. Never a real Claude response, never a real student
  card. Anonymize aggressively.
- A fixture is committed only if a test references it. Orphan fixtures are
  deleted in REFACTOR.
- Fixtures are plain JSON or factory functions. Factories preferred when tests
  need parameterization:

  ```ts
  export const makeCard = (overrides: Partial<Card> = {}): Card => ({
    id: "00000000-0000-0000-0000-000000000001",
    courseId: "00000000-0000-0000-0000-00000000000c",
    question: "le chien",
    answer: "the dog",
    distractors: ["the cat", "the bird"],
    sm2Ease: 2.5,
    sm2Interval: 0,
    sm2Reps: 0,
    nextReviewAt: "2026-04-22T00:00:00Z",
    ...overrides,
  });
  ```

---

## 6. Speed budget

- Unit suite: must run in <5s total on waldo's Mac. Slower = broken; find the
  slow test and fix it (usually a missing fake).
- Integration suite: must run in <30s total.
- Every test must be independently runnable in any order. No shared mutable
  state, no test depending on the previous test's side effects.

---

## 7. Bug fixes

A bug fix is a TDD cycle like any other, but with a specific RED:

1. Write a test that *reproduces the bug*. It must fail on the current code.
2. Confirm it fails for the right reason (the bug itself, not a typo).
3. Fix the code. The new test goes green. No other tests go red.
4. Leave the test in place forever. It is now the regression guard.

A bug fix without a regression test is not a fix — it's a retry waiting to
happen.

---

## 8. Refactors

Refactors must not change behavior, therefore must not need new tests. If a
refactor needs a new test, it's not a refactor — it's a feature change in
disguise, and it needs its own RED list.

Before refactoring, run the full suite and confirm it's green. After
refactoring, run the full suite and confirm it's *still* green. If coverage on
touched files drops, the refactor exposed untested code that was previously
hidden — add tests for it before merging.

---

## 9. When TDD slows you down

It will, occasionally. Almost always the cause is one of:

- **The seam is wrong.** You're trying to test something that has hardcoded
  dependencies. Fix the seam, the test becomes easy. See
  [testability-patterns.md](testability-patterns.md).
- **The unit is too big.** You're testing three behaviors at once. Split the
  unit, split the tests.
- **You're testing the mock, not the behavior.** If a test only asserts "the
  mock was called with X", delete it — it's testing the implementation, not
  the outcome. Assert on the observable effect (row in tables, JSON response,
  rendered DOM element, log line).

The answer is never "skip the test this time". The answer is "fix the thing
that made the test hard".

---

*This methodology is enforced by the repo-local `/tdd-cycle` skill. Run it at
the start of any coding task.*
