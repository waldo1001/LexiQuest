---
phase: 5
slice: 2
name: POST / PUT / DELETE user CRUD (admin)
status: proposed
---

# Phase 5 · Slice 2 — admin user CRUD

## 1. Task

Add `POST /api/users` (admin-only, create), `PUT /api/users/:id`
(admin-only, update incl. optional password rehash), and
`DELETE /api/users/:id` (admin-only, hard-delete the user row) — plus
full input validation and hash/token leakage guards.

## 2. Scope boundary

**IN**

- Extend existing `makeUsersHandler` to accept `POST` (admin-only create).
- **New** handler factory `makeUsersIdHandler(deps)` in
  `api/src/functions/users-id.ts` for `PUT` and `DELETE` at route
  `users/{id}`.
- Password hashing via the `PasswordHasher` seam on create + optional
  rehash on PUT.
- UUID generation via the `Random` seam for new user row keys.
- `created_at` stamped via the `Clock` seam.
- Admin-only guard: `auth.isAdmin === true`; else 403.
- Self-delete guard: an admin cannot DELETE their own user row (403).
- Response shape mirrors `GET /api/users` full profile; never leaks
  `password_hash`.
- Tests cover: 401 (no session), 403 (non-admin, self-delete),
  400 (invalid body), 404 (PUT/DELETE unknown id), happy paths, and
  shape assertions.
- Registration in `api/src/index.ts`.

**OUT**

- **Cascade deletion** of the deleted user's courses / cards / attempts
  / sessions — Slice 3.
- Frontend `AdminPanel.jsx` + route guard + `fetchUsers`/`createUser`/
  `updateUser`/`deleteUser` in `api.js` — Slice 4.
- Email / login-name uniqueness beyond the Design.md `name` collision
  check (a DB-level unique constraint is N/A in Table Storage; we do a
  lookup).
- Pagination / filtering.
- Audit log / soft-delete.

## 3. Files to create / touch

- `api/src/functions/users.ts` — extend to handle `POST` (admin create).
- `api/src/functions/users.test.ts` — extend with POST tests.
- `api/src/functions/users-id.ts` — **new** handler for PUT/DELETE.
- `api/src/functions/users-id.test.ts` — **new** tests.
- `api/src/index.ts` — import `"./functions/users-id.js"`.

## 4. Seams involved

- `tables` — `upsert`, `remove`, `getById`, `listByPartition` (for name
  collision check).
- `signer` — via `requireAuth`.
- `hasher` — bcrypt hash of the provided password (both create +
  optional rehash).
- `random` — new user `rowKey` UUID.
- `clock` — `created_at` stamp on create.

All five already have fakes in `api/testing/`.

## 5. RED test list

### `users.test.ts` — new `describe("POST /api/users")` block

- **P1**: 401 without a cookie.
  - name: `"POST returns 401 without a session cookie"`
- **P2**: 403 when caller is authenticated but not admin.
  - name: `"POST returns 403 when caller is non-admin"`
- **P3**: 400 when body is missing required fields.
  - name: `"POST returns 400 when name or password is missing"`
- **P4**: 400 when `ui_language` is invalid.
  - name: `"POST returns 400 when ui_language is invalid"`
- **P5**: 409 when a user with the same name already exists.
  - name: `"POST returns 409 on duplicate name"`
- **P6**: 201 on success with the new full profile, no hash leak.
  - name: `"POST returns 201 with the created profile and never leaks password_hash"`
- **P7**: 201 persists the row with a bcrypt-shaped hash and the
  requested fields.
  - name: `"POST persists the new user with a hashed password"`
- **P8**: 405 for unexpected method (e.g. `PATCH`).
  - name: `"returns 405 for unsupported method PATCH"`

### `users-id.test.ts` — new file

- **Q1**: 401 without a cookie (PUT or DELETE).
  - name: `"PUT returns 401 without a session cookie"` /
    `"DELETE returns 401 without a session cookie"`
- **Q2**: 403 for non-admin caller (PUT + DELETE).
  - name: `"PUT returns 403 when caller is non-admin"` /
    `"DELETE returns 403 when caller is non-admin"`
- **Q3**: 404 when the target user does not exist.
  - name: `"PUT returns 404 when target user does not exist"` /
    `"DELETE returns 404 when target user does not exist"`
- **Q4**: 400 on invalid PUT body values.
  - name: `"PUT returns 400 on invalid ui_language"` /
    `"PUT returns 400 on invalid is_admin type"` /
    `"PUT returns 400 on empty password string"`
- **Q5**: 200 on PUT with a field subset (merge semantics): `name`,
  `color`, `avatar_emoji`, `ui_language`, `is_admin`, `settings`.
  - name: `"PUT merges supplied fields and keeps others unchanged"`
- **Q6**: PUT with `password` rehashes and replaces `password_hash`;
  no leak in the response.
  - name: `"PUT rehashes password when provided, never returns the hash"`
- **Q7**: PUT without `password` leaves `password_hash` unchanged.
  - name: `"PUT without password preserves the existing password_hash"`
- **Q8**: PUT ignores attempts to overwrite `rowKey` / `created_at` /
  `partitionKey` / `password_hash` directly.
  - name: `"PUT ignores body attempts to mutate rowKey / created_at /
    partitionKey / password_hash directly"`
- **Q9**: DELETE removes the row and returns 204.
  - name: `"DELETE hard-deletes the user and returns 204"`
- **Q10**: DELETE of self (admin deleting own row) returns 403.
  - name: `"DELETE returns 403 when admin targets their own rowKey"`
- **Q11**: Method dispatch — 405 for `POST`/`GET` on `users/{id}`.
  - name: `"returns 405 for unsupported methods on users/{id}"`
- **Q12**: Missing `{id}` route param guarded.
  - name: `"returns 400 when id path param is missing"`

## 6. Open questions / assumptions

- **Assumption**: DELETE of a user that has no related rows is safe
  even without the cascade logic (Slice 3 fills that in). We do not
  write cascade hooks here — Slice 3 layers them on.
- **Assumption**: Self-delete guard is the correct safety net (admin
  cannot lock themselves out). Flagged — if the user disagrees, we
  rip it out in Slice 3.
- **Assumption**: `ui_language` / `preferred_mode` share the same
  validation whitelist as `me.ts`. We lift the validators into a
  helper rather than duplicating the sets.
- **Assumption**: Invariant 1 is preserved — `PUT /api/users/{id}`
  reads the target id from the **route param**, not `body.userId`.
  The existing meta-test still passes (grep for `body.userId` / 
  `req.body.userId` — we never write that).
- **Assumption**: Minimum password length = 1 (non-empty). The real
  design doc doesn't specify; Lex's password will be whatever the
  operator chooses.

## 7. Risks

- Password-hash leakage in POST / PUT response. Mitigated by
  explicit property projection (reuse `fullProfile` from `users.ts`).
- `/security-scan` will fail if we accidentally fixture a real bcrypt
  hash. Tests must use `FakePasswordHasher` outputs only.
- `PUT` merge logic could allow privilege escalation if we merge
  `is_admin=true` without requiring admin auth. Handler gate is
  admin-only, so this is blocked by test Q2.

## 8. Out-of-scope follow-ups

- Cascade-delete of courses/cards/attempts/sessions — Slice 3.
- Frontend AdminPanel + route guard + API wrappers — Slice 4.
- `phase-5-done` tag after Slice 4 ships.
