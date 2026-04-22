# Changelog — LexiQuest

Reverse chronological. Newest date first. One line per change, past tense,
plain English. Link the most relevant doc or plan.

## 2026-04-22

- Scaffolded `api/` (Azure Functions v4, Node 20, TypeScript) with Vitest
  Tier A (90%) thresholds; `hello` HTTP trigger returns
  `{msg:"Hello from LexiQuest"}`; coverage 100% on touched files. Phase 1
  Slice 2. See
  [plan](plans/done/phase-1-slice-2-api-scaffold.md).
- Scaffolded `frontend/` (Vite + React JS) with Vitest + Testing Library; `App`
  renders a LexiQuest heading; coverage 100% on touched files. Phase 1 Slice 1.
  See [PROGRESS.md](../PROGRESS.md) and
  [plan](plans/done/phase-1-slice-1-frontend-scaffold.md).
- Bootstrapped the TDD toolchain (CLAUDE.md, copilot-instructions,
  docs/tdd/**, .claude/skills/{tdd-cycle,security-scan,docs-update,local-smoke,deploy-swa},
  testing drop-ins). No application code yet. See [PROGRESS.md](../PROGRESS.md) Phase 0.
