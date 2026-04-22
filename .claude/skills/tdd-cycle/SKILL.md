---
name: tdd-cycle
description: Run the LexiQuest TDD cycle for a coding task. Use at the start of ANY code change (feature, bug fix, refactor) to write and get approval on a plan, then produce the RED test list, confirm failing tests, scaffold testable seams, implement to GREEN, refactor, and verify tier-appropriate coverage + requirement traceability. Invoke proactively — never write production code without running this first.
---

# /tdd-cycle — LexiQuest TDD enforcer

You are about to make a code change in the LexiQuest workspace. This skill
forces you through the TDD cycle defined in
[docs/tdd/methodology.md](../../../docs/tdd/methodology.md). **Do not skip
steps. Do not merge steps.**

## Step 0 — Load the rules

Re-read these before you write anything:

1. [docs/tdd/methodology.md](../../../docs/tdd/methodology.md)
2. [docs/tdd/testability-patterns.md](../../../docs/tdd/testability-patterns.md) — especially §6 (the four LexiQuest invariants)
3. [docs/tdd/ai-maintainability.md](../../../docs/tdd/ai-maintainability.md)
4. [docs/tdd/coverage-policy.md](../../../docs/tdd/coverage-policy.md)
5. [Design.md](../../../Design.md) — the phase you are working on

If the task is a bug fix, also read methodology.md §7.
If the task is a refactor, also read methodology.md §8.

## Step 0.5 — PLAN (write a md file, then STOP for approval)

**Non-negotiable, before anything else in this cycle.**

Write a markdown plan file at
`docs/plans/phase-<N>-slice-<M>-<short-name>.md` (e.g.
`docs/plans/phase-2-slice-1-table-client.md`) with the following sections:

1. **Task** — one sentence.
2. **Scope boundary** — what is IN this slice and what is explicitly OUT
   (deferred to later slices). Be ruthless: a slice is one TDD cycle,
   not a phase.
3. **Files to create / touch** — exact paths under `api/` or `frontend/`.
4. **Seams involved** — tables | claude | clock | hasher | signer | random |
   logger | tts | fetch | none.
5. **RED test list** — draft of Step 3 (ACs + test file + test name + edge
   cases).
6. **Open questions / assumptions** — each entry is either a question for
   the user or a stated assumption flagged for confirmation.
7. **Risks** — what could go wrong, what would force a rollback.
8. **Out-of-scope follow-ups** — bullets.

After writing the file, **post its path in chat and stop. Do not proceed
to Step 1 until the user has explicitly approved the plan** ("go",
"approved", "looks good", "yes proceed"). Silence is not approval.

If the user requests changes, edit the plan file and re-ask. Never start
FRAME / RED / code from an unapproved plan.

## Step 1 — FRAME (≤150 words)

Post in chat a short framing that answers all four questions. Hard cap:
**150 words total**.

1. **Goal of this step** — what are we creating, in one sentence.
2. **Where it stands in the project** — which phase from
   [../../../PROGRESS.md](../../../PROGRESS.md), which prior steps it
   builds on, what comes after.
3. **Why it is needed** — what breaks or is missing without it.
4. **What it contributes** — which piece of the architecture in
   [../../../Design.md](../../../Design.md) this advances, or which API
   endpoint, screen, or seam it unlocks.

Only after posting this framing, proceed.

## Step 2 — State the task in one sentence

Write in chat: "Task: <one sentence describing the intended behavior
change>". If you can't state it in one sentence, the task is too big —
split it.

## Step 3 — Produce the RED list

Post in chat a bulleted list. For each acceptance criterion derived from the
task:

```
- AC<n>: <behavior in one sentence>
  - test file: api/<path>.test.ts | frontend/src/<path>.test.jsx
  - test name: "<reads like a spec line>"
  - seams touched: <tables | claude | clock | hasher | signer | random | logger | tts | fetch | none>
  - edge cases: <empty | date-range boundary | unicode | pipe-alternatives | midnight-rollover | markdown-fenced-json | cookie-expired | cross-user | ...>
```

Do not write any code — production or test — before this list is posted.

## Step 4 — Write the FIRST failing test

Pick the simplest RED from the list. Write *only that one test*.

Run only that test file.

- In `api/`: `cd api && npx vitest run <path>`
- In `frontend/`: `cd frontend && npx vitest run <path>`

Observe the failure.

- If the failure is about plumbing (`Cannot find module`, `is not a
  function`), go to Step 5 to scaffold, then come back.
- If the failure is about behavior (`expected X received Y`, `expected
  function to throw`), you have a true RED. Go to Step 6.

Post in chat: `RED confirmed: <failure message>`.

## Step 5 — Scaffold the seam

Minimum shape so the test can reach its assertion:
- files + module exports
- explicit type signatures (TS) or JSDoc (JS)
- stub implementation throwing `new Error("not implemented: <name>")`
- fakes for any untouched seams the test needs (use existing ones in
  `api/testing/` or `frontend/src/testing/` when possible; add new ones
  following [testability-patterns.md](../../../docs/tdd/testability-patterns.md))

The scaffold is testable code structure — not behavior. Go back to Step 4
and re-run.

## Step 6 — GREEN: simplest code that passes

Write the *minimum* implementation that turns this one test green. Not the
prettiest, not the most general.

Run the touched test file. Confirm it's green.
Run the full suite in the affected project. Confirm nothing else went red.

Post in chat: `GREEN: <test name>`.

## Step 7 — Next RED

Repeat Steps 4–6 for every item on the RED list. Each cycle is one test,
one GREEN. When the list is empty, go to Step 8.

## Step 8 — REFACTOR

With all tests green, clean up:
- rename for clarity
- extract helpers where duplication is *real* (not speculative)
- tighten types
- delete dead code, dead comments, orphan fixtures

After each meaningful change, run the full suite. If it goes red, revert.

## Step 9 — COVER

Run coverage for the touched project:
- `cd api && npm test` → prints coverage, enforces Tier A (90%) thresholds.
- `cd frontend && npm test` → enforces Tier A for `src/lib/**` and Tier B
  (70% lines/functions/statements) elsewhere.

Checks:

- Tier A files ≥90% lines + branches + functions + statements?
- Tier B files ≥70% lines + functions + statements? (Branches reported but
  not enforced — inspect low-branch files as a smell signal.)
- Every AC on the list has at least one named test? Write the traceability
  mapping now.

If below threshold, add tests for the uncovered lines or justify an
exclusion in `vitest.config.ts` with a comment.

## Step 10 — SECURITY SCAN

Run the `/security-scan` skill
([.claude/skills/security-scan/SKILL.md](../security-scan/SKILL.md)).

It enforces: no tracked secrets; no bcrypt hashes, session tokens, Claude
API keys, or Azure connection strings in source / logs / error messages /
fixtures / snapshots; gitignore baseline intact; meta-tests for the four
LexiQuest invariants still passing; and no high/critical `npm audit`
findings once the projects exist.

A finding **blocks** the cycle. Never "note and continue". On a real
secret hit, follow the rotation protocol in the skill before doing
anything else.

**Only on PASS** continue to Step 11.

## Step 11 — UPDATE DOCS

Run the `/docs-update` skill
([.claude/skills/docs-update/SKILL.md](../docs-update/SKILL.md)).

At minimum this appends a bullet to
[docs/changelog.md](../../../docs/changelog.md). User-visible changes also
touch [setup.md](../../../docs/setup.md),
[getting-started.md](../../../docs/getting-started.md), and/or
[user-guide.md](../../../docs/user-guide.md).

`/docs-update` also archives the plan file written in Step 0.5: when the
slice is complete it moves `docs/plans/<name>.md` to
`docs/plans/done/<name>.md` and rewrites every link in the repo.

## Step 12 — REVIEW

Answer each question from
[methodology.md §2.8](../../../docs/tdd/methodology.md) and each box from
[ai-maintainability.md "Review checklist"](../../../docs/tdd/ai-maintainability.md).
"Yes" to every one, or go back.

## Step 13 — Report

Post a short summary in chat:

```
TDD cycle complete.
- Task: <one sentence>
- Phase / slice: <N> / <M> — <short-name>
- Tests added: <N>
- Files touched: <list>
- Coverage: api <X>% lines / <Y>% branches; frontend <X>% lines
- AC traceability:
  - AC1 <...> → <test file>: "<test name>"
  - AC2 <...> → <test file>: "<test name>"
- Notes: <any surprises, new seams added, fakes written>
```

---

**If at any step the test is hard to write, the code is wrong — not the
test. Stop, fix the seam, continue. Never skip a test "just this once".**
