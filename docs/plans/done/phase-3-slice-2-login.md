---
phase: 3
slice: 2
name: POST /api/login
status: proposed
---

# Phase 3 · Slice 2 — `POST /api/login`

## 1. Task

HTTP handler that accepts `{ userId, password }`, verifies against
`users`, issues a signed session cookie on success, returns generic
401 on failure.

## 2. Scope (IN / OUT)

**IN**: `api/src/functions/login.ts` handler factory that takes
DI'd `{ tables, hasher, signer, clock, logger }` and returns the
registered handler. Sets an HTTP-only, `Secure`, `SameSite=Lax`,
30-day `session` cookie.

**OUT**: `requireAuth` middleware, `/api/me`, `/api/logout` → Slice
3. `/api/users/public` → Slice 4.

## 3. Files

- `api/src/shared/session-cookie.ts` — helpers for cookie name,
  header serialization, 30-day exp.
- `api/src/functions/login.ts` (handler factory + registration)
- `api/src/functions/login.test.ts`
- `api/src/shared/session-cookie.test.ts`

## 4. Seams

`tables`, `hasher`, `signer`, `clock`, `logger`.

## 5. RED list

- **L1**: Valid creds → 200 with `{ id, name, isAdmin, ui_language }` +
  `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
- **L2**: Unknown user → 401 with generic message.
- **L3**: Wrong password → 401 with generic message (no leak of
  which one was wrong).
- **L4**: Body missing fields → 400.
- **L5**: Logger records `login_success` / `login_failed` events
  with `userId` only (no password, no hash).
- **L6**: 401 response body does not contain password_hash or the
  plaintext password.

## 6. Assumptions

- 30-day session matches Design.md §5.2 ("30-day exp baked into
  payload").
- Login endpoint is `/api/login` (anonymous auth level; SWA routes
  per Slice 3 of Phase 1 pass `/api/*` through to Functions).

## 7. Risks

- `HttpRequest.text()` / `.json()` API shape in v4 — verified from
  prior hello slice.

## 8. Out-of-scope

- `POST /api/logout` / `GET /api/me` / `requireAuth` → Slice 3.
