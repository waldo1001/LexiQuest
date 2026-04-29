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
- `ANTHROPIC_API_KEY` comes from
  [api/local.settings.json](../../../api/local.settings.json) — the
  skill does not create, rotate, or echo it. If it's missing, skip the
  AI-import probe and note it in the report.
- `SESSION_SECRET` is the dev-only value already in `local.settings.json`
  — never the production value.
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

## Step 2 — Seed test users + current year

Run the seed script against Azurite. The seed script is `api/scripts/seed.ts`,
invoked via the `seed` npm script. Env-var names are
`AZURE_STORAGE_CONNECTION_STRING` (not `STORAGE_CONNECTION_STRING`) and
`PASSWORD_<NAME>` (not `SEED_PASSWORD_<NAME>`):

```sh
cd api && AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true" \
  PASSWORD_WALDO="smoke-waldo" \
  PASSWORD_LEX="smoke-lex" \
  PASSWORD_MATS="smoke-mats" \
  PASSWORD_BEN="smoke-ben" \
  PASSWORD_KAAT="smoke-kaat" \
  PASSWORD_AMARYLLIS="smoke-amaryllis" \
  npm run seed
cd ..
```

Expect output listing six user UUIDs (Waldo + five students: Lex, Mats,
Ben, Kaat, Amaryllis) and confirmation of year `2025-2026`. No
duplicates on re-run. Capture Lex's UUID for the login probe in step 4.2,
and the year UUID in case you need to create a course in step 4.6.

## Step 3 — Boot Vite + `swa start`

The working pattern (mirrors [`/dev-start`](../dev-start/SKILL.md)) is to
start Vite separately on 5173, then point `swa start` at it. The
Functions host reads `api/local.settings.json` directly, which already
holds Azurite's connection string, the dev `SESSION_SECRET`, and
`ANTHROPIC_API_KEY`.

Export `ANTHROPIC_API_KEY` from `local.settings.json` into the shell
**before** running `swa start`. SWA skips empty/already-set env vars
from `local.settings.json` — and if the parent shell has it set to
empty, the AI-import probe in 4.6 will 502.

```sh
# (a) Start Vite on its default port 5173
cd frontend && npm run dev > "$SMOKE_DIR/vite.log" 2>&1 &
VITE_PID=$!
cd ..
# Wait until Vite serves the index page
until curl -sS -o /dev/null -w "" http://localhost:5173/ 2>/dev/null \
  && [ "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:5173/)" = "200" ]; do
  sleep 1
done

# (b) Export the API key, then boot SWA → Functions on 7071, SWA on 4280
export ANTHROPIC_API_KEY=$(node -e "process.stdout.write(require('./api/local.settings.json').Values.ANTHROPIC_API_KEY)")
echo "KEY_LEN=${#ANTHROPIC_API_KEY}"  # must be > 0; if 0, AI-import probe will fail
swa start http://localhost:5173 --api-location api > "$SMOKE_DIR/swa.log" 2>&1 &
SWA_PID=$!

# Wait until /api/hello answers — confirms both Functions and SWA proxy are wired
until [ "$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:4280/api/hello 2>/dev/null)" = "200" ]; do
  sleep 2
done
```

Note on `localhost`: Vite binds to IPv6 (`::1`) by default on macOS, so
`nc -z 127.0.0.1 5173` returns false even when Vite is up. Always probe
readiness via `curl http://localhost:5173/`.

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

Expect: JSON array of 6 objects (Waldo + 5 students) with `id`, `name`,
`avatar_emoji`, `avatar_image_url`, `color`. No `password_hash`, no
`settings`, no `is_admin`.

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

`/api/cards/import` requires a `courseId` belonging to the caller, so on
a freshly-seeded smoke run create a throwaway course first (use the year
UUID captured in step 2):

```sh
COURSE_ID=$(curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/courses" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"smoke-course\",\"emoji\":\"🧪\",\"color\":\"#16a34a\",\"language\":\"fr\",\"default_mode\":\"self_grade\",\"year_id\":\"<year-uuid>\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

PIXEL="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
curl -sS -b "$COOKIE_JAR" -X POST "$BASE/api/cards/import" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":\"$COURSE_ID\",\"imageBase64\":\"$PIXEL\",\"mimeType\":\"image/png\"}" \
  -w "\nHTTP=%{http_code}\n"
```

PASS conditions (composition root + SDK wiring confirmed):
- HTTP 200 with non-empty `candidates` array, OR
- HTTP 422 with `{"error":"Claude returned unparseable JSON","raw":"...image is empty/no text..."}` — Claude was invoked end-to-end and replied normally; it just couldn't parse cards from a 1×1 pixel.

FAIL: HTTP 502, 500 with auth errors, or anything indicating the SDK
client wasn't constructed (composition-root regression). If `KEY_LEN=0`
in step 3, this probe will 502 — fix the export, don't ship.

If `ANTHROPIC_API_KEY` is not set in `local.settings.json`, skip and note
in the report.

## Step 5 — Teardown

`pkill -f "swa start"` only matches the literal `swa start` command-line
prefix; the underlying `node` and `func` children won't match. Kill by
PID where you have one, then sweep the ports.

```sh
kill $SWA_PID    2>/dev/null; wait $SWA_PID    2>/dev/null
kill $VITE_PID   2>/dev/null; wait $VITE_PID   2>/dev/null
kill $AZURITE_PID 2>/dev/null; wait $AZURITE_PID 2>/dev/null

# Sweep any node/func processes still holding the smoke ports
for PORT in 4280 5173 7071 10000 10001 10002; do
  PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)
  [ -n "$PID" ] && kill -9 "$PID" 2>/dev/null
done

rm -rf "$SMOKE_DIR"
```

Or — if you also want any pre-existing dev processes gone — run
[`/dev-stop`](../dev-stop/SKILL.md) instead, which handles all four
process families idempotently.

## Step 6 — Report

Post one short summary in chat:

```
/local-smoke PASS
- Azurite: booted, seeded 6 users (Waldo + 5 students) + current year
- Public users: 6 rows, no hashes leaked
- Login: 200 + HttpOnly session cookie
- /api/me: 200 with Lex profile
- Wrong password: 401, no cookie set
- SPA fallback: index.html served for unknown routes
- AI import probe: <PASS (N candidates) | PASS (Claude responded, no cards extracted) | SKIPPED — no ANTHROPIC_API_KEY>
- Teardown: throwaway artifacts removed, smoke ports free
```

On FAILURE: report the step that failed, the expected-vs-actual, and — critically — **do not push to main**. Smoke failures are boot-path or wiring regressions, and they always reach production if you ship past them.

For the auto-deploy itself, use [`/deploy-swa`](../deploy-swa/SKILL.md) to monitor the resulting GitHub Actions run.
