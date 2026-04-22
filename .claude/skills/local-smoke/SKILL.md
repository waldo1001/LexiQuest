---
name: local-smoke
description: Fast pre-deploy sanity check that boots the real SWA + Functions stack locally against Azurite and exercises the critical-path routes end-to-end. Use before pushing to main (which auto-deploys) and whenever the API composition roots or static-web-app config change. Never touches real storage.
---

# /local-smoke — LexiQuest pre-deploy smoke test

You are about to push a change. `npm test` in both `api/` and `frontend/`
covers unit + integration tests, but it does **not** boot the real
`swa start` process that stitches together:

- the Vite dev server (React app)
- the per-function entry files in `api/*/index.ts` (the composition roots
  where real `@azure/data-tables`, `@anthropic-ai/sdk`, and
  `process.env` wiring actually run)
- the [staticwebapp.config.json](../../../staticwebapp.config.json) route
  rules (SPA fallback, `/api/*` passthrough)
- the cookie and session-signing wiring in a real HTTP round-trip

This skill closes that gap in ~60 seconds, against
[Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
so it cannot corrupt real storage.

## When to run

- **Always** before pushing to `main` (remember: push to main auto-deploys
  via GitHub Actions → SWA).
- On demand when the user asks to "smoke test" or "dry-run" locally.
- After editing any `api/*/index.ts` composition root,
  `staticwebapp.config.json`, `frontend/vite.config.js`,
  `api/shared/config.ts`, or the auth / session wiring.

Not a substitute for `npm test`. Run the suite first; only run smoke when
it's green.

## Invariants

- Storage endpoint is always **Azurite** (`http://127.0.0.1:10002` /
  `10001` / `10000`), never a real Azure Storage account. Use the
  well-known Azurite connection string.
- `ANTHROPIC_API_KEY` comes from [.env](../../../.env) — the skill does
  not create, rotate, or echo it. If it's missing, skip the AI-import
  probe and note it in the report.
- `SESSION_SECRET` is a throwaway value injected for smoke only —
  **never** the production value.
- The throwaway Azurite tables get wiped before and after the run.

## Step 0 — Preflight

Run tests first. Do not continue on failure.

```sh
cd api && npm test
cd ../frontend && npm test
```

Confirm the required CLIs are installed:

```sh
which swa || npm i -g @azure/static-web-apps-cli
which azurite || npm i -g azurite
```

## Step 1 — Clean slate

Start Azurite on its default ports with a throwaway data directory, and
wipe any prior smoke tables.

```sh
SMOKE_DIR="/tmp/lexiquest-smoke"
rm -rf "$SMOKE_DIR" && mkdir -p "$SMOKE_DIR"
azurite \
  --location "$SMOKE_DIR" \
  --silent \
  --tablePort 10002 --blobPort 10000 --queuePort 10001 \
  > "$SMOKE_DIR/azurite.log" 2>&1 &
AZURITE_PID=$!
sleep 2
```

## Step 2 — Seed 4 test users + current year

Run the seed script against Azurite:

```sh
STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true" \
  SEED_PASSWORD_LEX="smoke-lex" \
  SEED_PASSWORD_MATS="smoke-mats" \
  SEED_PASSWORD_BEN="smoke-ben" \
  SEED_PASSWORD_WALDO="smoke-waldo" \
  node scripts/seed.js
```

Expect output listing the 4 user UUIDs and confirmation of year
`2025-2026`. No duplicates on re-run.

## Step 3 — Boot `swa start`

Boot the full stack against Azurite on a non-default port so nothing
collides with a running dev server.

```sh
STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true" \
  SESSION_SECRET="smoke-secret-do-not-use-in-prod" \
  swa start http://localhost:4280 \
    --run "npm --prefix frontend run dev" \
    --api-location api \
    --port 4280 \
    > "$SMOKE_DIR/swa.log" 2>&1 &
SWA_PID=$!
# swa start takes a few seconds to boot both vite + functions
sleep 10
```

## Step 4 — Probe critical path routes

All probes use a cookie jar so the session round-trip is exercised.

```sh
COOKIE_JAR="$SMOKE_DIR/cookies.txt"
BASE="http://localhost:4280"
```

### 4.1 Public users list

```sh
curl -sS "$BASE/api/users/public" | tee "$SMOKE_DIR/public.json"
```

Expect: JSON array of 4 objects with `id`, `name`, `avatar_emoji`, `color`.
No `password_hash`, no `settings`, no `is_admin`.

### 4.2 Login

```sh
curl -sS -c "$COOKIE_JAR" -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<lex-uuid-from-step-2>","password":"smoke-lex"}' \
  | tee "$SMOKE_DIR/login.json"
```

Expect: `{ "id": "...", "name": "Lex", "isAdmin": false, "ui_language": "nl" }`.
Cookie jar should now contain a `session` cookie with `HttpOnly` flag.

```sh
grep -c "HttpOnly" "$COOKIE_JAR" # expect >= 1
```

### 4.3 Authenticated `/api/me`

```sh
curl -sS -b "$COOKIE_JAR" "$BASE/api/me"
```

Expect: same user JSON as above.

### 4.4 Wrong password → 401, no cookie

```sh
curl -sS -c "$SMOKE_DIR/bad-cookie.txt" -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<lex-uuid>","password":"wrong"}' \
  -o /dev/null -w "%{http_code}\n"
```

Expect: `401`. `bad-cookie.txt` should contain no `session` cookie.

### 4.5 SPA fallback

```sh
curl -sS "$BASE/somewhere/that/does/not/exist" | grep -c '<div id="root">'
```

Expect: `1` (index.html served as fallback).

### 4.6 AI import probe (only if `ANTHROPIC_API_KEY` is set)

If present, POST a 1×1-pixel placeholder image to `/api/cards/import` and
assert a non-empty `candidates` array OR a documented "no cards extracted"
response. This catches composition-root wiring of `@anthropic-ai/sdk`
that unit tests can't see.

If not set, skip and note in the report.

## Step 5 — Teardown

```sh
kill $SWA_PID 2>/dev/null; wait $SWA_PID 2>/dev/null
kill $AZURITE_PID 2>/dev/null; wait $AZURITE_PID 2>/dev/null
rm -rf "$SMOKE_DIR"
```

## Step 6 — Report

Post one short summary in chat:

```
/local-smoke PASS
- Azurite: booted, seeded 4 users + current year
- Public users: 4 rows, no hashes leaked
- Login: 200 + HttpOnly session cookie
- /api/me: 200 with Lex profile
- Wrong password: 401, no cookie set
- SPA fallback: index.html served for unknown routes
- AI import probe: <PASS (N candidates) | SKIPPED — no ANTHROPIC_API_KEY>
- Teardown: throwaway artifacts removed
```

On FAILURE: report the step that failed, the expected-vs-actual, and — critically — **do not push to main**. Smoke failures are boot-path or wiring regressions, and they always reach production if you ship past them.

For the auto-deploy itself, use [`/deploy-swa`](../deploy-swa/SKILL.md) to monitor the resulting GitHub Actions run.
