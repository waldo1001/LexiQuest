# Phase 9 Slice 1 — Row-key format meta-test

## Task
Write a meta-test that enforces the `{ISO_timestamp}_{uuid}` row-key convention for attempts and sessions tables.

## Scope boundary
IN: meta-test scanning production source for inline row-key construction; unit tests for `makeAttemptRowKey`/`makeSessionRowKey` helpers; verify ISO prefix enables lexicographic date-range queries.
OUT: date-range queries themselves (Phase 14), any storage changes.

## Files to create / touch
- `api/src/__meta__/row-key-format.test.ts` (new)

## Seams involved
none (code-scanning + pure-function tests)

## RED test list
- AC1: `makeAttemptRowKey(ts, id)` returns `${ts}_${id}` and the prefix is a valid ISO string
- AC2: `makeSessionRowKey(ts, id)` returns `${ts}_${id}` and the prefix is a valid ISO string
- AC3: Lexicographic ordering on row keys mirrors chronological order (ISO prefix guarantees this)
- AC4: No production file under `api/src/functions/` assigns `rowKey` inline (bypassing the helpers)

## Open questions / assumptions
- Helpers already exist in `attempts-shared.ts` and `sessions-shared.ts` — test will confirm correct shape.

## Risks
- Low. Read-only scan; no production code changes.

## Out-of-scope follow-ups
- SessionResults screen (Slice 2)
- GET /api/stats/session/:id (Slice 3)
