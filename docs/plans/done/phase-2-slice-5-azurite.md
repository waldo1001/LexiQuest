---
phase: 2
slice: 5
name: Azurite-backed integration smoke
status: proposed
---

# Phase 2 · Slice 5 — Azurite-backed integration smoke

## 1. Task

Run the existing `TableStorage` contract suite against the real
`AzureTableStorage` pointed at a local Azurite instance, gated by an
env var so CI/local-without-Azurite still passes. This both exercises
the v8-ignored real client and gives us a "did I break the wire"
signal for Phase 2.

## 2. Scope (IN / OUT)

**IN**

- `api/src/shared/__integration__/azure-table-storage.integration.test.ts`
  — runs the shared contract factory against `AzureTableStorage`
  with a fresh random-suffixed connection string.
- A per-test-run cleanup step: delete all rows from the six tables
  in the test partition before/after each test, or use a unique
  suffix per run.
- Skipped entirely unless `AZURITE_CONNECTION_STRING` is set in the
  env. CI without Azurite = still green.
- `api/package.json` `test:integration` already routes to it via the
  `**/__integration__/**` glob.
- Documentation in `docs/setup.md` describing how to boot Azurite
  (`npx azurite-table --silent --location /tmp/azurite`).

**OUT**

- Continuous Azurite in CI → would require provisioning GH Actions;
  deferred until the first phase that meaningfully depends on it
  (Phase 3 might be the natural point).
- Tagging `phase-2-done` → after Waldo runs the Azurite smoke.

## 3. Files

- `api/src/shared/__integration__/azure-table-storage.integration.test.ts`
  (new)
- `docs/setup.md` — add an "Azurite" subsection.

## 4. Seams

`tables` (real). `clock`/`random` not involved.

## 5. RED list

Inherits the 8 contract assertions from
`table-storage.contract.ts`. When Azurite is running, these run
against the real client; when not, they're skipped.

## 6. Assumptions

- Azurite v3.32+ is the in-memory/on-disk Table Storage emulator.
- The contract's unique-name strategy: each test gets a fresh table
  suffix (e.g. `users-<uuid8>`) — but our `TableName` type is a
  closed union, so the cleaner approach is to use a random
  partition-key per test run. The contract suite already uses
  distinct partition keys per test block; we just need to delete any
  stale rows before starting.

## 7. Risks

- Azurite not running → test is skipped (expected).
- Azurite on default port conflict → env var lets Waldo override the
  connection string.
- Slow first-table-create call → existing `ensureTable` guard is a
  per-process cache; fine.

## 8. Out-of-scope

- Phase 3 auth.
