# Getting started — LexiQuest

Five-minute happy path for a developer (human or AI) new to this repo.

Current state: **Phase 0 — toolchain only.** The five-minute path right
now is:

1. Clone the repo.
2. Read [CLAUDE.md](../CLAUDE.md) — especially the 10-step TDD cycle and
   the four LexiQuest invariants.
3. Skim [Design.md](../Design.md) §§ 1–5 (overview, data model,
   architecture, cross-cutting concerns).
4. Read [PROGRESS.md](../PROGRESS.md) to see where we are.
5. Invoke [`/tdd-cycle`](../.claude/skills/tdd-cycle/SKILL.md) to start
   the next slice. The skill writes a plan file under
   [plans/](plans/) and waits for your approval before any code is
   written.

Once Phase 1 is done, this doc gets actual boot-up steps: `npm install`,
`swa start`, first `/api/hello` round-trip.

Until then, the point of this doc is: **don't start coding without
running `/tdd-cycle` first.**
