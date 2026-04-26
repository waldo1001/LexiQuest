# Getting started — LexiQuest

Five-minute happy path. No Azure account needed. Everything runs on your
laptop.

## What you need installed

- **Node.js 20+** (check: `node -v`)
- **npm 10+** (comes with Node)

That's it for running tests. For the full app locally you also need:

- **Azurite** (fake Azure storage): `npm install -g azurite`
- **SWA CLI** (local web server): `npm install -g @azure/static-web-apps-cli`

## Step 1 — Clone and install

```sh
git clone <repo-url>
cd LexiQuest

# Install dependencies for both halves of the app:
cd api && npm install && cd ..
cd frontend && npm install && cd ..
```

## Step 2 — Run the tests

This is the thing you'll do most often. No database, no server, no
setup — just run them.

```sh
# API tests (TypeScript, ~200 tests):
cd api && npm test

# Frontend tests (JavaScript, ~150 tests):
cd frontend && npm test
```

Both commands run **all** unit tests and print a coverage report. If
they're green, the code works. That's it.

### Watch mode (re-runs on save)

Useful while coding — tests re-run every time you save a file:

```sh
cd api && npm run test:watch      # leave running in a terminal tab
cd frontend && npm run test:watch  # leave running in another tab
```

### Running a single test file

```sh
cd api && npx vitest run src/shared/card-priority.test.ts
cd frontend && npx vitest run src/screens/StudySession.test.jsx
```

### Other test commands

```sh
cd api && npm run test:meta         # security invariant tests only
cd api && npm run typecheck         # TypeScript type check (no tests)
```

## Step 3 — Run the full app locally

This boots the actual app in your browser — login screen, study sessions,
the works. You need Azurite (fake database) running.

### 3a. Create your local config files

```sh
# From the repo root:
cp .env.example .env
cp api/local.settings.json.example api/local.settings.json
```

Now edit `.env` and fill in:

```
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true
PASSWORD_WALDO=pick-something
PASSWORD_LEX=pick-something
PASSWORD_MATS=pick-something
PASSWORD_BEN=pick-something
PASSWORD_KAAT=pick-something
PASSWORD_AMARYLLIS=pick-something
SESSION_SECRET=any-random-string-at-least-32-characters-long
```

Leave `ANTHROPIC_API_KEY` blank unless you want AI card import to work
(it costs money).

### 3b. Start Azurite (fake database)

```sh
azurite --silent --location /tmp/azurite
```

Leave this running in its own terminal tab. It listens on ports
10000-10002.

### 3c. Seed the database

This creates the family user accounts — Waldo (admin / supervisor,
hidden from the picker) plus five students (Lex, Mats, Ben, Kaat,
Amaryllis):

```sh
cd api && npm run seed
```

You should see output listing six user IDs. You only need to do this
once (or after wiping `/tmp/azurite`).

### 3d. Start the app

You need **two** terminal tabs:

**Tab 1** — frontend dev server:
```sh
cd frontend && npm run dev
```

**Tab 2** — SWA (stitches frontend + API together):
```sh
swa start http://localhost:5173 --api-location api
```

Wait ~10 seconds, then open **http://localhost:4280** in your browser.

You should see the login screen with five student avatars
(Amaryllis, Ben, Kaat, Lex, Mats — alphabetically). Waldo is not
listed; the supervisor account is hidden from the picker. Click one,
enter the password you put in `.env`, and you're in.

To log in as Waldo for admin tasks: the seed output prints all six
UUIDs — copy Waldo's and visit `/login/<waldo-uuid>` directly. The
admin panel at `/admin` is gated by `is_admin` after login.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Login works but cookie is dropped immediately | Make sure `api/local.settings.json` has `"COOKIE_SECURE": "false"` (it does if you copied the example) |
| "Table not found" errors | Azurite isn't running, or you forgot `npm run seed` |
| Port 4280 already in use | Kill the old `swa` process: `pkill -f "swa start"` |
| Port 10002 already in use | Kill the old Azurite: `pkill -f azurite` |
| AI import returns an error | `ANTHROPIC_API_KEY` is missing or invalid in `api/local.settings.json` — this is optional |

## Quick reference

| What | Command | Where |
|------|---------|-------|
| Run all API tests | `npm test` | `api/` |
| Run all frontend tests | `npm test` | `frontend/` |
| Watch mode (API) | `npm run test:watch` | `api/` |
| Watch mode (frontend) | `npm run test:watch` | `frontend/` |
| Type check | `npm run typecheck` | `api/` |
| Meta tests (security) | `npm run test:meta` | `api/` |
| Start Azurite | `azurite --silent --location /tmp/azurite` | anywhere |
| Seed users | `npm run seed` | `api/` |
| Start frontend | `npm run dev` | `frontend/` |
| Start full stack | `swa start http://localhost:5173 --api-location api` | repo root |
| Open app | http://localhost:4280 | browser |
