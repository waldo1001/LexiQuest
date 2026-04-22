---
phase: 5
slice: 1
name: GET /api/users
status: proposed
---

# Phase 5 · Slice 1 — `GET /api/users`

## 1. Task

Add `GET /api/users` (authenticated, any user) that returns the full
user list — id, name, isAdmin, color, avatar_emoji, ui_language,
settings, created_at — but never `password_hash`.

## 2. Scope boundary

**IN**

- New handler factory `makeUsersHandler(deps)` in `api/src/functions/users.ts`.
- Requires authentication (any logged-in user); non-authenticated → 401.
- Returns `200` with array sorted by name; method guard → 405 for non-GET.
- Unit tests covering auth gate, happy path, shape (no hash), sorting, empty store.
- Registration wired into `api/src/index.ts`.

**OUT**

- `POST /api/users` (create user, admin) — Slice 2.
- `PUT /api/users/:id` (update/reset password, admin) — Slice 2.
- `DELETE /api/users/:id` (admin + cascade) — Slices 2 & 3.
- Frontend `fetchUsers()` call in `api.js` — not needed until Slice 4 (AdminPanel).
- Pagination or filtering — not needed; family-sized data set.
- `DELETE /api/users` guard or per-user sub-routes — not this slice.

## 3. Files to create / touch

- `api/src/functions/users.ts` — **new** handler + registration.
- `api/src/functions/users.test.ts` — **new** test file.
- `api/src/index.ts` — import `"./functions/users.js"` to trigger registration.

## 4. Seams involved

- `tables` — `listByPartition<UserRow>("users", "users")`
- `signer` — via `requireAuth(req, { signer })`

No new seams. Both already have fakes in `api/testing/`.

## 5. RED test list

All tests live in `api/src/functions/users.test.ts`.

- **P1**: No session cookie → `requireAuth` returns 401.
  - test name: `"returns 401 when no session cookie is present"`
  - seams: signer (FakeSessionSigner rejecting)
  - edge cases: missing cookie header entirely

- **P2**: Invalid/expired session token → 401.
  - test name: `"returns 401 when session token is invalid"`
  - seams: signer (FakeSessionSigner rejecting)

- **P3**: Authenticated, empty store → `200 []`.
  - test name: `"returns 200 with empty array when no users exist"`
  - seams: tables (FakeTableStorage — no rows), signer (valid token)

- **P4**: Authenticated, three users → 200 with array of three profiles sorted by name.
  - test name: `"returns 200 with all users sorted by name"`
  - seams: tables, signer

- **P5**: Response shape NEVER contains `password_hash` or `created_at` top-level leakage.
  - test name: `"response items never contain password_hash or created_at"`
  - seams: tables, signer
  - edge cases: accidental object spread

- **P6**: Response shape includes exactly `{id, name, isAdmin, color, avatar_emoji, ui_language, settings}`.
  - test name: `"response items contain the expected full profile shape"`
  - seams: tables, signer

- **P7**: Non-GET method (e.g. POST) → 405.
  - test name: `"returns 405 for unsupported methods"`
  - seams: signer (valid token, to ensure 405 not 401)

- **P8**: Authenticated non-admin user can access the list (invariant 1 check — userId from session).
  - test name: `"non-admin authenticated user receives the full user list"`
  - seams: tables, signer

## 6. Open questions / assumptions

- **Assumption**: `settings` is safe to expose to any authenticated user
  (needed for stats screens — Design.md §5.9 says any user can call this).
  Flagged for confirmation.
- **Assumption**: `created_at` should be included in the response ("full
  shape, no hashes"). If only `publicProfile` fields are needed, `created_at`
  can be dropped. Defaulting to **include** it based on Design.md Phase 5
  wording: "full list". Flagged for confirmation.
- **Question**: Should the response also include `avatar_emoji`? Yes —
  already confirmed by the public endpoint pattern and admin panel needs.
- **Assumption**: No `DELETE /api/users` route at this path (only
  `DELETE /api/users/:id` in Slice 2) — confirmed by Design.md.

## 7. Risks

- **Accidental spread of `password_hash`**: mitigated by explicit property
  projection (same pattern as `users-public.ts`).
- **Auth gate bypass**: `requireAuth` is already well-tested; reusing it
  directly means the only risk is forgetting the call — the test P1/P2
  block this.
- **index.ts import order**: the handler must be imported after Azure
  Functions app is initialized — `hello.ts` already does this safely;
  we follow the same pattern.

## 8. Out-of-scope follow-ups

- `POST /api/users` — Slice 2.
- `PUT /api/users/:id` — Slice 2.
- `DELETE /api/users/:id` — Slice 2.
- Cascade-delete — Slice 3.
- Frontend `AdminPanel.jsx` + route guard — Slice 4.
- `fetchUsers()` in `frontend/src/lib/api.js` — Slice 4.
