# Setup — LexiQuest

How to stand up LexiQuest locally and in Azure.

For the quickest path, see [getting-started.md](getting-started.md). This
doc covers everything in more detail.

## Prerequisites

- **Node.js 20+** (`node -v` to check; tested on Node 24)
- **npm 10+** (comes with Node)
- **Azurite** — local Azure Storage emulator: `npm install -g azurite`
- **SWA CLI** — Azure Static Web Apps emulator: `npm install -g @azure/static-web-apps-cli`
- **Azure Functions Core Tools v4** (optional — only for `func start`
  standalone): `npm install -g azure-functions-core-tools@4 --unsafe-perm true`

## Install

```sh
cd frontend && npm install
cd ../api && npm install
```

## Running tests

Tests are the main dev loop. No database, no server needed.

```sh
# API (TypeScript, ~200 tests, 90% coverage floor):
cd api && npm test

# Frontend (JavaScript, ~150 tests, 70% coverage floor):
cd frontend && npm test
```

### Other test commands

| Command | What it does | Directory |
|---------|-------------|-----------|
| `npm run test:watch` | Re-run on file save | `api/` or `frontend/` |
| `npm run test:meta` | Security invariant tests | `api/` |
| `npm run test:integration` | Azurite integration tests (needs Azurite running) | `api/` |
| `npm run test:contract` | Seam contract tests | `api/` |
| `npm run typecheck` | TypeScript type check (no tests) | `api/` |
| `npx vitest run path/to/file.test.ts` | Single file | `api/` or `frontend/` |

## Local config files

Two config files are needed for running the full app. Neither is
committed (`.gitignore`).

### `.env` (repo root)

```sh
cp .env.example .env
```

Fill in:

| Variable | What | Example value for local dev |
|----------|------|---------------------------|
| `AZURE_STORAGE_CONNECTION_STRING` | Where to find the database | `UseDevelopmentStorage=true` |
| `PASSWORD_WALDO` | Seed password for Waldo (admin / supervisor — hidden from picker) | any string |
| `PASSWORD_LEX` | Seed password for Lex | any string |
| `PASSWORD_MATS` | Seed password for Mats | any string |
| `PASSWORD_BEN` | Seed password for Ben | any string |
| `PASSWORD_KAAT` | Seed password for Kaat | any string |
| `PASSWORD_AMARYLLIS` | Seed password for Amaryllis | any string |
| `SESSION_SECRET` | HMAC key for session cookies | 32+ random chars |
| `ANTHROPIC_API_KEY` | AI card import (optional, costs money) | `sk-ant-...` or leave blank |

### `api/local.settings.json`

```sh
cp api/local.settings.json.example api/local.settings.json
```

The example file already has the right values for local dev:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "COOKIE_SECURE": "false",
    "ANTHROPIC_API_KEY": "sk-ant-REPLACE_WITH_REAL_KEY"
  }
}
```

The important one: `"COOKIE_SECURE": "false"` — without this, the session
cookie gets the `Secure` flag, which browsers drop on plain HTTP
(`localhost`).

## Azurite (local database)

Azurite emulates Azure Table Storage on your machine. Start it in its own
terminal:

```sh
azurite --silent --location /tmp/azurite
```

It listens on ports 10000 (blob), 10001 (queue), 10002 (table). The
connection string `UseDevelopmentStorage=true` points to it automatically.

To wipe the database and start fresh:

```sh
rm -rf /tmp/azurite && azurite --silent --location /tmp/azurite
```

## Seeding users

Creates the family accounts and the current school year. Requires
Azurite running and `.env` filled in.

The seed roster:

- **Waldo** — admin / supervisor. Hidden from the student picker, but
  still able to log in for admin tasks (creating users, etc.).
- **Lex, Mats, Ben, Kaat, Amaryllis** — student accounts shown in the
  picker, alphabetically.

```sh
cd api && npm run seed
```

Output lists six UUIDs (one per seeded user). Idempotent — safe to
re-run; existing rows are detected by `name` and left alone.

## Full-stack local run

**Terminal 1** — Azurite:
```sh
azurite --silent --location /tmp/azurite
```

**Terminal 2** — Frontend:
```sh
cd frontend && npm run dev
```

**Terminal 3** — SWA (the glue):
```sh
swa start http://localhost:5173 --api-location api
```

Open **http://localhost:4280**. Login with any seeded user.

### What `swa start` does

- Proxies `http://localhost:4280/` to the Vite dev server (port 5173)
- Boots the Azure Functions host for `api/` (port 7071 internally)
- Routes `/api/*` requests to the Functions host
- Applies `staticwebapp.config.json` rules (SPA fallback, etc.)

## Session cookie `Secure` flag (`COOKIE_SECURE`)

The session cookie uses the `Secure` attribute by default (required for
HTTPS in production). Browsers silently drop `Secure` cookies on plain
HTTP, so for local dev you must set `"COOKIE_SECURE": "false"` in
`api/local.settings.json`.

Any value other than the literal string `"false"` (including unset) keeps
`Secure` on. Production stays safe by default.

## Anthropic API key (AI card import)

The photo-to-flashcard feature uses the Anthropic Claude API. Optional —
everything else works without it.

Add to `api/local.settings.json`:

```json
"ANTHROPIC_API_KEY": "sk-ant-your-real-key-here"
```

For Azure production: set it in the SWA app settings (Azure portal →
Static Web App → Configuration → Application settings).

## Azure production deployment

Full operator runbook — including one-time Azure setup, day-to-day
deploy, and the live → dev snapshot workflow — lives in
[deployment.md](deployment.md).

TL;DR: push to `main` triggers GitHub Actions → deploys to Azure Static
Web Apps. The workflow file is `.github/workflows/azure-static-web-apps.yml`.
