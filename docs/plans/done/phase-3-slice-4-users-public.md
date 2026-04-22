---
phase: 3
slice: 4
name: GET /api/users/public
status: proposed
---

# Phase 3 · Slice 4 — `GET /api/users/public`

## 1. Task

Public user picker endpoint. No auth required. Returns
`[{ id, name, avatar_emoji, color }]` — never `password_hash`,
`is_admin`, `settings`, `ui_language`.

## 2. Scope

**IN**: handler factory over `{ tables }`. Unit tests that lock
down the projection (no hash/admin flag/settings exposed).

**OUT**: caching, rate limiting — not a hot endpoint.

## 3. Files

- `api/src/functions/users-public.ts`
- `api/src/functions/users-public.test.ts`

## 4. Seams

`tables`.

## 5. RED list

- **P1**: Empty store → `200 []`.
- **P2**: Three users → 200 with three items each having only
  `{id, name, avatar_emoji, color}`.
- **P3**: Response NEVER contains `password_hash`, `is_admin`,
  `settings`, or `ui_language` keys.
- **P4**: Response is sorted by name for stable UI rendering.

## 6. Assumptions

- "Public" here means anonymous-auth in SWA terminology — no cookie
  needed.

## 7. Risks

- Accidentally spreading the full user row. Mitigation: explicit
  projection in the handler + shape test.

## 8. Out-of-scope

- Admin "list with hashes" → never allowed.
