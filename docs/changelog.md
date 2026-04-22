# Changelog — LexiQuest

Reverse chronological. Newest date first. One line per change, past tense,
plain English. Link the most relevant doc or plan.

## 2026-04-22

- `App` now fetches `/api/hello` on mount via `frontend/src/lib/api.js`
  (injected `fetch` seam) and renders the returned `msg`; shows
  "Loading…" during the request and falls back to "LexiQuest" on
  failure. Tier A coverage 100%. Phase 1 Slice 4. See
  [plan](plans/done/phase-1-slice-4-fetch-hello.md).
- Added `staticwebapp.config.json` (SPA fallback + `/api/*` passthrough)
  and the Azure Static Web Apps GitHub Actions deploy workflow; added
  `frontend/src/lib/swaConfig.js` helper with Tier A coverage. Phase 1
  Slice 3. See [plan](plans/done/phase-1-slice-3-swa-deploy.md). User
  action needed: provision the Azure SWA and add the
  `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret.
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
