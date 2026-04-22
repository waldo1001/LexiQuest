# Getting started — LexiQuest

Five-minute happy path for a developer (human or AI) new to this repo.

Current state: **Phase 1 in progress.** `frontend/` is scaffolded and
testable; `api/` and full-stack `swa start` land in later slices.

1. Clone the repo.
2. Read [CLAUDE.md](../CLAUDE.md) — especially the 10-step TDD cycle and
   the four LexiQuest invariants.
3. Skim [Design.md](../Design.md) §§ 1–5 (overview, data model,
   architecture, cross-cutting concerns).
4. Read [PROGRESS.md](../PROGRESS.md) to see where we are.
5. Boot the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev   # http://localhost:5173 — the LexiQuest shell
   npm test      # Vitest + coverage
   ```

6. Invoke [`/tdd-cycle`](../.claude/skills/tdd-cycle/SKILL.md) to start
   the next slice. The skill writes a plan file under
   [plans/](plans/) before any code is written.

Full-stack boot (`swa start` with the API and Azurite) lands in Phase 1
Slices 2–5.

**Don't start coding without running `/tdd-cycle` first.**
