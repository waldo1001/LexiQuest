---
name: dev-stop
description: Kill all LexiQuest local dev processes (Azurite + Vite + Functions host + SWA CLI) and free their ports. Idempotent — safe to run when nothing is running. Use when the user wants a clean slate, when orphaned background processes are holding ports, or as a teardown after a debug session.
---

# /dev-stop — Tear down the LexiQuest local dev environment

Kill every LexiQuest dev process and free every dev port. **This is the
canonical teardown** — `/dev-start` runs the same block as its first
step. If you change how things stop, change it here, not in dev-start.

The skill is **idempotent**: running it when nothing is running is a
no-op, not an error. It is also safe to run from any working directory
(no `cd` required).

## Step 1 — Kill the processes

```sh
pkill -9 -f "swa start"  2>/dev/null
pkill -9 -f "func start" 2>/dev/null
pkill -9 -f "vite"       2>/dev/null
pkill -9 -f "azurite"    2>/dev/null
# belt-and-braces: free the ports even if a stray child survived pkill
lsof -ti :4280,5173,7071,10000,10001,10002 2>/dev/null | xargs -r kill -9 2>/dev/null
sleep 1
```

`pkill ... 2>/dev/null` returns non-zero when nothing matched — that is
fine, it just means nothing of that kind was running. Do not treat it as
a failure.

## Step 2 — Verify the ports are free

```sh
lsof -i :4280,5173,7071,10000,10001,10002 | grep LISTEN
# expect: NO output
```

If anything is still listed:

```sh
# show what's holding each port
lsof -i :4280,5173,7071,10000,10001,10002 -sTCP:LISTEN
# kill the specific PID
kill -9 <PID>
```

A common stragglers list and what to do:

| Process name in `lsof` | What it is | How to stop |
|---|---|---|
| `node` on 5173 | Vite dev server | already covered by `pkill -f vite` |
| `node` on 4280 | SWA emulator | `pkill -9 -f "swa start"` |
| `func` on 7071 | Functions host | `pkill -9 -f "func start"` |
| `node` on 10000-10002 | Azurite | `pkill -9 -f azurite` |
| `node` started by `npm run` wrapping vite/swa | the wrapping `npm` survives `pkill` of the child sometimes | `lsof -ti :<port> \| xargs kill -9` |

## Step 3 — Report

Report one line:

```
/dev-stop OK — all ports free
```

or, if any port stayed busy:

```
/dev-stop PARTIAL — :7071 still held by PID 12345 (`func`)
```

…and follow up with the explicit `kill -9 <PID>`.

## Non-goals

- **Do not** delete Azurite data (`/tmp/azurite`). The user may want
  their seeded tables back when they next run `/dev-start`. Teardown of
  data is a separate, more dangerous operation.
- **Do not** unset `ANTHROPIC_API_KEY` or any other env var in the
  user's shell. The skill manipulates processes only.
- **Do not** kill unrelated `node` or `func` processes. The `pkill -f`
  patterns here are scoped to the LexiQuest dev tooling. If a `func`
  host on a non-LexiQuest port (e.g. 7072) is also running, leave it.
