---
phase: 3
slice: 6
name: auth-boundary meta-test
status: proposed
---

# Phase 3 · Slice 6 — `auth-boundary.test.ts` meta-test

## 1. Task

Grep-based meta-test in `api/src/__meta__/auth-boundary.test.ts`
that fails if any handler under `api/src/functions/` reads `userId`
from `req.body` or any string matching
`req.body.userId` / `body.userId`. Enforces LexiQuest Invariant 1
(Design.md §4; CLAUDE.md #1).

## 2. Scope

**IN**: one meta-test file. Exempts files that are genuinely about
*looking up* a user by id in a route param, which should use
`req.params.userId` via a known helper.

**OUT**: runtime enforcement (would require middleware rewiring —
not worth it; the meta-test is the gate).

## 3. Files

- `api/src/__meta__/auth-boundary.test.ts`

## 4. Seams

`none` (fs-only).

## 5. RED list

- **M1**: The meta-test itself runs and passes against the current
  handler set (login / logout / me / users-public / hello).
- **M2**: If a handler is introduced that reads `req.body.userId`,
  the test fails with a clear message naming file + line.

## 6. Assumptions

- `fs.readdirSync` recursively walks `api/src/functions/`.
- Regex: `/\b(req\.body|body)\.userId\b/` hits any combined use.
  A helper to strip comments is not needed — comments that match
  the regex are themselves a code smell.

## 7. Risks

- False positives on a file that explicitly tests "reject body.userId"
  — mitigated by skipping `.test.ts` files when walking.

## 8. Out-of-scope

- Phase 14 meta-tests for stats privacy.
