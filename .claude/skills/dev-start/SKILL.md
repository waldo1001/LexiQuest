---
name: dev-start
description: Start the full LexiQuest local development environment (Azurite + Vite + SWA CLI). ALWAYS kills any existing dev processes first, then starts clean — never tries to attach to a running stack. Use when the user wants to run the app locally, test a feature in the browser, or diagnose a runtime error that unit tests cannot catch.
---

# /dev-start — Start the LexiQuest local dev environment

**Operating principle: kill first, start clean — always.** Do not try to
detect "is something already running and good?" and skip steps. A stale
SWA proxy with a fresh func host (or vice versa) is the most common
failure mode, and it is invisible to port checks. The fixed order is:
**KILL EVERYTHING → start fresh**, every single invocation. This is
fast (a couple of seconds) and removes a whole class of "but it was
working a minute ago" confusion.

## Key pitfall — ANTHROPIC_API_KEY must be non-empty

SWA CLI skips any value in `api/local.settings.json` for a key that is
**already present** in the shell environment — even if the shell value is
empty. If `ANTHROPIC_API_KEY` is exported as `""` (e.g. from a stale
`.zshrc` export or a sourced `.env`), the Functions host will start with
an empty key and every `/api/cards/import` call returns 502.

**Always inject the key explicitly** before starting SWA (step 4 below).

---

## Step 1 — KILL EVERYTHING (always, unconditionally)

Do not check first. Do not skip if "looks fine". Always run this block.

**Run [`/dev-stop`](../dev-stop/SKILL.md)** — that skill is the canonical
teardown. It kills every LexiQuest dev process (swa, func, vite, azurite),
frees ports 4280/5173/7071/10000/10001/10002, and verifies nothing is
left listening. It is idempotent, so it is safe to run when nothing is
running.

If you cannot invoke another skill from here, inline its commands:

```sh
pkill -9 -f "swa start"  2>/dev/null
pkill -9 -f "func start" 2>/dev/null
pkill -9 -f "vite"       2>/dev/null
pkill -9 -f "azurite"    2>/dev/null
lsof -ti :4280,5173,7071,10000,10001,10002 2>/dev/null | xargs -r kill -9 2>/dev/null
sleep 1
lsof -i :4280,5173,7071,10000,10001,10002 | grep LISTEN
# expect: NO output
```

Keep these commands aligned with `/dev-stop`. If you change one, change
the other.

**Port reference (for diagnosis only — do NOT use to decide whether to
skip Step 1):**

- **5173** — Vite frontend dev server
- **4280** — SWA emulator (frontend + API gateway)
- **7071** — Azure Functions host
- **10000-10002** — Azurite (blob, queue, table)

---

## Step 2 — Build the API so the func host loads fresh code

Stale `api/dist/` is the second-most-common failure mode after stale
processes. Always rebuild before booting func.

```sh
npm --prefix api run build
```

---

## Step 3 — Start Azurite

```sh
azurite --silent --location /tmp/azurite &
```

Listens on 10000 (blob), 10001 (queue), 10002 (table).

---

## Step 4 — Start the Vite frontend

```sh
cd frontend && npm run dev &
```

Wait until you see `Local: http://localhost:5173/`.

---

## Step 5 — Start SWA CLI with the API key injected

```sh
cd /path/to/LexiQuest   # repo root
export ANTHROPIC_API_KEY=$(node -e "const s=require('./api/local.settings.json');process.stdout.write(s.Values.ANTHROPIC_API_KEY)")
echo "KEY_LEN=${#ANTHROPIC_API_KEY}"   # must be > 0
swa start http://localhost:5173 --api-location api
```

Expected startup output:
```
KEY_LEN=108
Skipping 'ANTHROPIC_API_KEY' from local settings as it's already defined in current environment variables.
✔ http://localhost:7071 validated successfully
Azure Static Web Apps emulator started at http://localhost:4280. Press CTRL+C to exit.
```

The "Skipping" line is fine here — the key is already set correctly in the
environment. What is **not** fine is `KEY_LEN=0` — that means the export
failed and you must debug why before continuing.

---

## Step 6 — Verify

```sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:4280/api/hello
# expect: 200
```

Open **http://localhost:4280** in the browser. Login screen should show all avatars.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Port 4280 is already taken` at SWA start | Step 1 was skipped — re-run it |
| `Port 7071 is unavailable` | Step 1 was skipped — re-run it |
| `Claude is unavailable` even after a fresh upload | `api/dist/` is stale — re-run step 2, then bounce func (re-run step 1 + step 5) |
| `KEY_LEN=0` | Check `local.settings.json` has `ANTHROPIC_API_KEY` set; check nothing in your shell is exporting it as empty |
| `Claude is unavailable — please try again later` (502) | The Functions host started with an empty key — repeat step 5 |
| Login screen empty / no avatars | Azurite not running, or database not seeded — run `cd api && npm run seed` |
| `azurite: command not found` | `npm install -g azurite` |
| `swa: command not found` | `npm install -g @azure/static-web-apps-cli` |
