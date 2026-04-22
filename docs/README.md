# docs — LexiQuest

Index of the `/docs` folder. Every file here is linked from somewhere
meaningful (README, CLAUDE.md, a skill, or another doc). Adding or
removing a file requires updating this index in the same commit.

## User-facing

- [setup.md](setup.md) — local setup and Azure provisioning. Grows per
  phase.
- [getting-started.md](getting-started.md) — five-minute happy path for
  a new dev on this repo.
- [user-guide.md](user-guide.md) — how family members use the running
  app.

## Project log

- [changelog.md](changelog.md) — dated bullets of what changed.

## Planning

- [plans/](plans/) — in-flight TDD-cycle plan files (`phase-N-slice-M-*.md`).
- [plans/done/](plans/done/) — archived plans for completed slices.

## TDD toolchain

- [tdd/README.md](tdd/README.md) — read this first.
- [tdd/methodology.md](tdd/methodology.md) — the full cycle and
  definition-of-done.
- [tdd/testability-patterns.md](tdd/testability-patterns.md) — LexiQuest's
  seams and the four project invariants.
- [tdd/ai-maintainability.md](tdd/ai-maintainability.md) — code rules
  that keep the repo legible across Claude sessions.
- [tdd/coverage-policy.md](tdd/coverage-policy.md) — Tier A / Tier B
  thresholds and enforcement.
