---
phase: 3
slice: 3
name: requireAuth + logout + me
status: proposed
---

# Phase 3 · Slice 3 — `requireAuth` + `/api/logout` + `/api/me`

## 1. Task

Shared middleware `requireAuth(req, deps)` that reads the cookie,
verifies, returns `{ userId, isAdmin }` or a 401 response. Handlers
for `POST /api/logout` (clear cookie, 204) and `GET /api/me`
(profile).

## 2. Scope

**IN**: `requireAuth`, logout handler, me handler with DI'd seams.
Auth-boundary meta-test placeholder (full enforcement in Phase 3
Slice 6).

**OUT**: `/api/users/public` (Slice 4). PATCH /api/me (Phase 4).

## 3. Files

- `api/src/shared/auth.ts` — `requireAuth(req, { signer }) => { userId, isAdmin } | HttpResponseInit`
- `api/src/functions/logout.ts` + test
- `api/src/functions/me.ts` + test
- `api/src/shared/auth.test.ts`

## 4. Seams

`signer`, `tables` (for /me).

## 5. RED list

- **A1**: `requireAuth` with no cookie returns 401 `HttpResponseInit`.
- **A2**: `requireAuth` with a forged/expired cookie returns 401.
- **A3**: `requireAuth` with a valid cookie returns `{userId, isAdmin}`.
- **Lo1**: `/api/logout` clears the cookie, 204.
- **Lo2**: `/api/logout` is idempotent on no cookie (still 204).
- **Me1**: `/api/me` with valid cookie returns profile (sans hash).
- **Me2**: `/api/me` with no cookie returns 401.
- **Me3**: `/api/me` NEVER includes `password_hash` in the body.
- **Me4**: `/api/me` 404 if the signed userId no longer exists (rare
  post-delete edge).

## 6. Assumptions

- `requireAuth` returns a TypeScript discriminated result:
  `{ ok: true, auth }` or `{ ok: false, response }`. Handlers fan
  out on that shape.

## 7. Risks

- Cookie header case sensitivity in Azure Functions v4 — use a
  case-insensitive lookup.

## 8. Out-of-scope

- Slice 4 `/api/users/public`.
- Slice 6 auth-boundary meta-test.
