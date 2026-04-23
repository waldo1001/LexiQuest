# Getting started — LexiQuest

Five-minute happy path for a developer (human or AI) new to this repo.

Current state: **Phase 1 complete (pending manual `swa start` smoke).**

1. Clone the repo.
2. Skim [CLAUDE.md](../CLAUDE.md) (TDD cycle + four invariants) and
   [Design.md](../Design.md) §§ 1–5. Then [PROGRESS.md](../PROGRESS.md)
   to see where we are.
3. Install per-project deps:
   ```sh
   cd frontend && npm install && cd ..
   cd api && npm install && cd ..
   ```
4. Run tests in each subproject:
   ```sh
   cd frontend && npm test && cd ..
   cd api && npm test && cd ..
   ```
5. Boot the full stack via the Azure SWA emulator:
   ```sh
   npm install -g @azure/static-web-apps-cli     # one-time
   (cd frontend && npm run dev) &                # Shell 1
   swa start http://localhost:5173 --api-location api  # Shell 2
   # -> http://localhost:4280 -> "<h1>Hello from LexiQuest</h1>"
   ```
   For login to work locally (HTTP), ensure
   `api/local.settings.json` contains `"COOKIE_SECURE": "false"` — see
   [setup.md](setup.md#session-cookie-secure-flag-cookie_secure).
6. Start the next coding task by invoking
   [`/tdd-cycle`](../.claude/skills/tdd-cycle/SKILL.md). The skill
   writes a plan file under [plans/](plans/) before any production
   code is touched.

**Rule**: don't start coding without running `/tdd-cycle` first.
