# Setup — LexiQuest

How to stand up LexiQuest locally and in Azure. This doc grows per phase.
Current state: **Phase 1 complete (pending manual `swa start` smoke).**

## Prerequisites

- Node.js 20 or newer (tested on Node 24).
- npm 10+.
- For full-stack local runs: the Azure Static Web Apps CLI —
  `npm install -g @azure/static-web-apps-cli`.
- For running the api under `func start` directly: Azure Functions
  Core Tools v4 —
  `npm install -g azure-functions-core-tools@4 --unsafe-perm true`.

## Install

```sh
cd frontend && npm install
cd ../api && npm install
```

## Frontend-only dev loop

```sh
cd frontend
npm run dev         # Vite at http://localhost:5173
npm test            # Vitest + coverage (Tier B global, Tier A for src/lib/)
npm run test:watch
npm run build       # -> frontend/dist
```

## API-only dev loop (tests + build; no Functions host)

```sh
cd api
npm test            # Vitest Tier A 90%
npm run typecheck
npm run build       # -> api/dist
```

## Full-stack local run

```sh
# Shell 1 — Vite dev server
cd frontend && npm run dev

# Shell 2 — SWA emulator proxies Vite + starts the Functions host
cd <repo-root>
swa start http://localhost:5173 --api-location api
# -> http://localhost:4280
#    /       serves the Vite SPA
#    /api/*  routes to the Azure Functions host (port 7071 internally)
```

A manual smoke: visit `http://localhost:4280`, confirm the `<h1>`
reads "Hello from LexiQuest" (proving the `/api/hello` round-trip).

## Phase 1 smoke checklist (run once before tagging phase-1-done)

- [ ] `cd frontend && npm test` — all green.
- [ ] `cd api && npm test` — all green.
- [ ] `swa start ... --api-location api` shows `<h1>Hello from LexiQuest</h1>`.
- [ ] Devtools Network tab shows `/api/hello` returned
      `{"msg":"Hello from LexiQuest"}`.
- [ ] After Azure SWA is provisioned and
      `AZURE_STATIC_WEB_APPS_API_TOKEN` is set, a push to `main`
      auto-deploys within ~5 minutes.

## Azurite (local Table Storage emulator)

Seed + the Azurite-backed `TableStorage` integration test require
Azurite running locally. Install + boot:

```sh
npm install -g azurite
# Storage emulator that LexiQuest's api/ talks to:
azurite-table --silent --location /tmp/azurite --debug azurite-debug.log
# runs on localhost:10002 (Table). Default connection string:
#   UseDevelopmentStorage=true
```

Opt the integration test into running by setting the env var:

```sh
export AZURITE_CONNECTION_STRING="UseDevelopmentStorage=true"
cd api && npm run test:integration
```

The seed script (Phase 2 Slice 4) uses
`AZURE_STORAGE_CONNECTION_STRING` (same value works against Azurite
locally).

## Anthropic API key (Phase 12+)

The AI card import feature requires an Anthropic API key. Add it to
`api/local.settings.json` (never committed — already in `.gitignore`):

```json
{
  "Values": {
    "ANTHROPIC_API_KEY": "sk-ant-REPLACE_WITH_REAL_KEY"
  }
}
```

For Azure production, set `ANTHROPIC_API_KEY` in the SWA app settings
(Azure portal → Static Web App → Configuration → Application settings).

See `api/local.settings.json.example` for the full local settings template.

## Coming in later phases

- Phase 2: `.env` / `local.settings.json` (real values, **never** committed),
  Azurite for local Table Storage, `scripts/seed.ts` to create the four
  family users.
- Phase 3: `SESSION_SECRET` env var, cookie flags.
