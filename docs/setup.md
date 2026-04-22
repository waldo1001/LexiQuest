# Setup — LexiQuest

How to stand up LexiQuest locally and in Azure. This doc grows per phase.
Current state: **Phase 0 — toolchain only, no application code yet.**

The first real setup steps land in [Phase 1](../Design.md#phase-1--project-skeleton--deployment-pipeline):

1. Create GitHub repo `waldo1001/lexiquest`.
2. Scaffold `frontend/` (Vite + React JS) and `api/` (Azure Functions TS
   + `hello/` function).
3. Add `staticwebapp.config.json`.
4. Provision Azure Static Web App (Free tier); link to `main`.
5. Confirm the auto-generated GitHub Actions workflow deploys.

Once Phase 1 is done, this doc will be filled with:

- Prerequisites (Node 20, SWA CLI, Azurite, Anthropic API key).
- `.env` / `local.settings.json` templates.
- `scripts/seed.ts` run instructions (Phase 2).
- Azure provisioning steps (Storage account, app settings).
- Local dev loop: `swa start`.
- Troubleshooting.

Until then, the only setup needed is this toolchain — which is ready as
soon as this repo is cloned and [CLAUDE.md](../CLAUDE.md) is read.
