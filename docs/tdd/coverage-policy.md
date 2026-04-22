# Coverage Policy — LexiQuest

## Thresholds (enforced by Vitest config)

LexiQuest uses a **two-tier** policy because UI presentation code is
genuinely expensive to test at the branch level without over-asserting on
implementation details.

### Tier A — business logic (≥90% lines + branches + functions + statements, per file)

Applies to:

- `api/**/*.ts` except the exclusions below
- `frontend/src/lib/**/*.js` — `api.js`, `sm2.js`, `xp.js`, `tts.js`,
  `random.js`, and any other pure-logic module

This is where bugs cost the most (wrong SM-2 math reschedules cards
incorrectly; wrong XP rule corrupts the gamification loop; broken session
cookie logic breaks auth for everyone). No exceptions.

### Tier B — UI presentation (≥70% lines + functions + statements, per file)

Applies to:

- `frontend/src/screens/**/*.jsx`
- `frontend/src/components/**/*.jsx`
- `frontend/src/charts/**/*.jsx`

Rationale: React screens have many branches that exist purely for visual
states (loading spinners, conditional classnames, ternary renderings of the
same content). Forcing 90% branch coverage pushes tests toward asserting
on DOM trivia rather than behavior. 70% keeps honest behavioral tests
without rewarding trivia.

Branch coverage in Tier B is **reported but not enforced**. Use it as a smell
signal during REVIEW — a file at 30% branches probably has an untested
error state worth a test.

## Exclusions (allowed zero coverage)

Composition roots and pure config — integration-tested via `/local-smoke`:

- `api/*/index.ts` — the per-function registration files that wire deps to
  the handler
- `api/shared/config.ts` — env var parsing
- `frontend/src/main.jsx` — React root + provider construction
- `frontend/vite.config.js` / `frontend/vite.config.ts`

Type-only and test-support:

- `**/*.d.ts`
- `api/testing/**` and `frontend/src/testing/**` — test doubles (covered by
  their contract tests)
- `**/__fixtures__/**` — static data
- `**/*.test.*` — tests don't count toward production coverage

Any new exclusion requires a comment in `vitest.config.ts` explaining why.

## What coverage actually enforces

Mechanical coverage is necessary but not sufficient. See
[methodology.md §2.6](methodology.md). The PR/commit message MUST also
include a semantic mapping:

```
Acceptance criteria traceability:
- AC1 "..." → path/to/file.test.ts: "test name"
- AC2 "..." → path/to/file.test.ts: "test name"
```

A file at 100% line coverage whose tests don't assert on behavior is still a
REVIEW failure.

## What coverage does NOT replace

- **Mutation testing** (Stryker) is the next-level check: for each line, flip
  an operator or remove a branch and see if any test fails. If no test
  fails, the line was "covered" but not actually *tested*. Candidate for
  Phase 10+ once the unit suite exists. Minimum surviving-mutant rate: <20%
  on Tier A.
- **Manual smoke tests** against a real study session. Automated coverage
  cannot catch "the real `@anthropic-ai/sdk` version renamed a field" or
  "`Azurite` and Azure Table Storage disagree on paging semantics".
  Smoke-test at every `phase-N-done` tag.

## Enforcement

- `npm test` in `api/` runs the Tier A suite with coverage and fails if
  thresholds are not met.
- `npm test` in `frontend/` runs the Tier B suite with coverage; blocks on
  Tier A thresholds for `frontend/src/lib/**` and on Tier B thresholds
  elsewhere.
- Pre-commit hook (set up after Phase 2): runs `npm test` on changed files
  (both projects if both were touched).
- CI (GitHub Actions workflow generated in Phase 1): runs both suites on
  every push to `main` and every PR. A failing coverage gate is never
  bypassed with `--coverage.thresholds=...` overrides. Fix the tests
  instead.

## When a test drops coverage

If a refactor reveals that an existing line was only "covered" by a test that
no longer hits it, that's a signal:

1. The test was covering implementation, not behavior. Good riddance.
2. The line is genuinely untested now. Add a behavior-focused test.

Either way, never delete the line just to boost the number. Understand *why*
it's uncovered first.
