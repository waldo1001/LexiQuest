# TDD Toolkit — LexiQuest

Read in this order:

1. [methodology.md](methodology.md) — the PLAN / FRAME / RED / GREEN / REFACTOR workflow and the definition-of-done. Read this first, every time.
2. [testability-patterns.md](testability-patterns.md) — how to make this project's seams (Table Storage, Claude, clock, password hasher, session signer, random, logger, fetch, TTS) injectable. Also the four LexiQuest-specific invariants (§6).
3. [ai-maintainability.md](ai-maintainability.md) — code rules that keep the codebase legible to humans and future Claude sessions.
4. [coverage-policy.md](coverage-policy.md) — tiered thresholds (90% on API + `frontend/src/lib/**`, 70% on frontend screens/components/charts), exclusions, enforcement.

Drop-in tooling: [../../testing/](../../testing/) — Vitest configs for both the API and the frontend, dev-deps manifests, and example test scaffolds.

Invoke [`/tdd-cycle`](../../.claude/skills/tdd-cycle/SKILL.md) at the start of any coding task.
