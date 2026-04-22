# Setup — LexiQuest

How to stand up LexiQuest locally and in Azure. This doc grows per phase.
Current state: **Phase 1 in progress — `frontend/` scaffolded, `api/` next.**

## Prerequisites

- Node.js 20 or newer (tested on Node 24 locally).
- npm 10+.

## Install

```sh
cd frontend
npm install
```

## Local dev loop (frontend only — Slice 1)

```sh
cd frontend
npm run dev         # Vite dev server at http://localhost:5173
npm test            # Vitest + coverage (enforces Tier B / Tier A thresholds)
npm run test:watch  # Vitest in watch mode
npm run build       # Production build to frontend/dist
```

Full-stack dev (`swa start`, Azurite, Anthropic, etc.) lands in later
slices as those pieces are introduced.

## Coming in later slices

- Slice 2: scaffold `api/` (Azure Functions TS) + `hello/` function, add
  `npm install` and `npm test` commands for it.
- Slice 3: `staticwebapp.config.json` + GitHub Actions deploy workflow +
  Azure Static Web App provisioning.
- Slice 4: wire `frontend` fetch of `/api/hello`.
- Slice 5: root `README.md` with full local dev instructions
  (`swa start` for the whole stack).
- Phase 2+: `.env` / `local.settings.json` templates, seed script, Azure
  Storage account, Anthropic key, `SESSION_SECRET`.
