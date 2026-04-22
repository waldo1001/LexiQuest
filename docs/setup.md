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

## Local dev loop (Slices 1–2 — frontend + api as separate processes)

```sh
# frontend
cd frontend
npm run dev         # Vite dev server at http://localhost:5173
npm test            # Vitest + coverage

# api (separate shell)
cd api
npm install         # first-time only
npm test            # Vitest + Tier-A coverage
npm run typecheck   # tsc strict
npm run build       # emits dist/
# `npm start` (func start) requires Azure Functions Core Tools v4 and a
#   local.settings.json (copy from local.settings.json.example).
```

Full-stack via `swa start` (which runs both under one proxy + routes
`/api/*` correctly) lands in Slice 3.

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
