# Phase 6 Slice 4 — Composition Root

## 1. Task

Wire up all implemented Azure Functions in `api/src/index.ts` so the real
Functions host registers login, logout, me, users, users-public, users-id,
years, years-id, courses, and courses-id alongside the existing hello endpoint.

## 2. Scope boundary

**IN:**
- Update `api/src/index.ts` to import real dependencies and call every
  `registerXxx()` function.
- Add `api/src/index.test.ts` that mocks `@azure/functions` and asserts all
  expected route names are registered.
- Commit the already-applied `exactOptionalPropertyTypes` fix to
  `api/src/functions/users-shared.ts`.

**OUT:**
- No new business logic — only wiring.
- No new seams. Real implementations already exist.
- No frontend changes.
- No changes to any `registerXxx()` or `makeXxxHandler()` function.

## 3. Files to create / touch

- `api/src/index.ts` — add all imports and `registerXxx()` calls.
- `api/src/index.test.ts` — new test file.
- `api/src/functions/users-shared.ts` — already fixed (conditional spread).

## 4. Seams involved

tables · hasher · signer · clock · random · logger

## 5. RED test list

- **AC1**: The composition root registers all 11 expected Azure Functions.
  - test file: `api/src/index.test.ts`
  - test name: `"registers all API functions when env vars are present"`
  - seams touched: tables, hasher, signer, clock, random, logger (all mocked
    via `@azure/functions` mock — real seam impls are constructed but never
    exercise network)
  - edge cases: missing env var (SESSION_SECRET < 16 chars throws; test
    provides a valid throwaway secret)

## 6. Open questions / assumptions

- `user-cascade.ts` has no `registerXxx()` — its `deleteUserAndCascade`
  helper is called directly by `users-id.ts`. It does NOT get a separate
  registration. **Assumption: confirmed by code inspection.**
- `logout` needs no deps (`registerLogout()` is zero-argument). **Confirmed.**
- `HmacSessionSigner` requires `{ secret, clock }` and secret ≥ 16 chars.
  **Confirmed from constructor.**

## 7. Risks

- Module-level side effects in `index.ts` run once on first import; if Vitest
  caches the module, re-runs in the same worker won't re-register. Mitigation:
  single `it` block — we only need to prove registration once.
- `vi.mock('@azure/functions')` affects any other test in the same file that
  imports Azure Functions types. Mitigation: keep this test file isolated;
  it contains only the composition-root tests.

## 8. Out-of-scope follow-ups

- Fail-fast guard: if `AZURE_STORAGE_CONNECTION_STRING` or `SESSION_SECRET`
  are missing at boot, log an error and exit. Deferred to a future hardening
  slice.
- `NODE_ENV`-based logging verbosity. Deferred.
