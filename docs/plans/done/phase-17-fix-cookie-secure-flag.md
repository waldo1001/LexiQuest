# Phase 17 — Fix `Secure` cookie flag for local dev

## Task
Make the session cookie's `Secure` attribute conditional on an env flag so local dev over plain HTTP can persist the session, while production over HTTPS keeps `Secure` on by default.

## Scope boundary
**IN**
- `api/src/shared/session-cookie.ts`: `buildSessionCookie` and `buildClearedSessionCookie` emit `Secure` conditionally based on `process.env.COOKIE_SECURE`.
- `api/src/shared/session-cookie.test.ts`: cover both branches (flag on, flag off, default).
- Example `api/local.settings.json.example`: add `COOKIE_SECURE=false` with a short comment so future local setup works first time.

**OUT**
- Any change to `login.ts` / `logout.ts` signatures or DI — the env is read inside the util, like the composition root already does for `AZURE_STORAGE_CONNECTION_STRING`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`.
- Frontend changes (there are none needed — the browser does the work).
- `NODE_ENV` sniffing. We use an explicit opt-out (`COOKIE_SECURE=false`) so the **safe default is `Secure` on**. Forgetting to set anything in prod = still secure.
- Rotating the currently-issued session secret. (The existing token format is unaffected.)

## Files to create / touch
- `api/src/shared/session-cookie.ts` (modify)
- `api/src/shared/session-cookie.test.ts` (extend)
- `api/local.settings.json.example` (add one key + comment)
- `api/local.settings.json` (user's local, not tracked — add `COOKIE_SECURE=false` so the running stack picks it up)
- `docs/changelog.md` (in step 11)
- `docs/setup.md` (in step 11 — document the flag)

## Seams involved
`none`. This is a pure function plus a read of `process.env`. No injected seams; no new ones needed.

## RED test list

- AC1: `buildSessionCookie` emits `Secure` when `COOKIE_SECURE` is unset (safe default).
  - test file: `api/src/shared/session-cookie.test.ts`
  - test name: `"emits Secure by default when COOKIE_SECURE is unset"`
  - seams touched: none
  - edge cases: env not present at all (delete the key)
- AC2: `buildSessionCookie` emits `Secure` when `COOKIE_SECURE=true`.
  - test file: same
  - test name: `"emits Secure when COOKIE_SECURE is 'true'"`
- AC3: `buildSessionCookie` does **not** emit `Secure` when `COOKIE_SECURE=false`.
  - test file: same
  - test name: `"omits Secure when COOKIE_SECURE is 'false'"`
  - edge cases: exact string `"false"` (case sensitive, lowercase); other values default to secure-on
- AC4: `buildSessionCookie` emits `Secure` for any value other than literal `"false"` (e.g. empty string, `"0"`, `"no"`).
  - test file: same
  - test name: `"treats non-'false' values as secure-on"`
- AC5: `buildClearedSessionCookie` mirrors the same rule (omits `Secure` when `COOKIE_SECURE=false`, otherwise emits it).
  - test file: same
  - test name: `"buildClearedSessionCookie omits Secure when COOKIE_SECURE is 'false'"` and `"buildClearedSessionCookie emits Secure by default"`
- Existing tests ("emits HttpOnly + Secure + SameSite=Lax + ...") will stay valid because default behavior is unchanged — but we need to make sure the test doesn't leak a previous test's env mutation. Use `beforeEach` / `afterEach` to snapshot & restore `process.env.COOKIE_SECURE`.

## Open questions / assumptions
1. **Assumption**: Explicit env opt-out (`COOKIE_SECURE=false`) is preferable to `NODE_ENV === 'production'` sniffing because the SWA emulator doesn't set `NODE_ENV` reliably, and an explicit flag makes the intent searchable.
2. **Assumption**: Reading `process.env` inside a small util (not a seam) is acceptable here — the codebase already does this in `src/index.ts` (composition root). The function is trivially testable by mutating and restoring the env within the test.
3. **Question**: Do we want a third value for the flag, e.g. `"auto"` that sniffs the forwarded proto? **Answered (no)**: explicit is better. Overkill for the symptom.

## Risks
- **Security regression in production** if someone sets `COOKIE_SECURE=false` in prod by mistake. Mitigation: the default is secure-on, the flag is documented only as a local-dev toggle in `setup.md`, and the variable name makes the intent unambiguous.
- **Test pollution** if a test sets `process.env.COOKIE_SECURE` and doesn't clean up — could flip the default for later tests in the file. Mitigation: `beforeEach`/`afterEach` snapshot/restore.
- **Low**: The currently running local session cookies (if any) were rejected by the browser, so nothing to invalidate. Users just retry login.

## Out-of-scope follow-ups
- Consider the same `Secure`-flag story for any future cookies (e.g. CSRF token if/when added).
- Document in Design.md §5 the decision to use an explicit env toggle rather than `NODE_ENV`.
- Consider whether a `docker-compose.dev.yml` or `.envrc` should centralize the local-dev env so `COOKIE_SECURE=false` and the other local-only values ship together.
