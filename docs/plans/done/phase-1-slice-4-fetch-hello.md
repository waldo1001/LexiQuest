---
phase: 1
slice: 4
name: frontend fetch /api/hello
status: proposed
---

# Phase 1 · Slice 4 — Frontend fetches `/api/hello`, renders `msg`

## 1. Task

On mount, the `App` component fetches `GET /api/hello`, and replaces its
hard-coded heading with the `msg` field from the JSON response.

## 2. Scope boundary

**IN**

- A small `fetch` seam in `frontend/src/lib/api.js` — a thin function
  `fetchHelloMessage({ fetchFn = fetch } = {})` returning the
  `msg` string. DI'd fetch so tests don't hit the network.
- `App.jsx` uses React state + `useEffect` to call
  `fetchHelloMessage()` and render the string once resolved. While
  loading, render "Loading…". On error, render "LexiQuest" (safe
  fallback — until we have proper error UI in Phase 17).
- Tests:
  - `api.test.js` — unit tests on `fetchHelloMessage` with a fake
    `fetchFn` (happy path + HTTP 500 error). Tier A.
  - `App.test.jsx` — updated to assert the message rendered after
    the fetch resolves, and the fallback on failure.

**OUT**

- Error boundary / global error UI → Phase 17.
- Retry / backoff → not in v1 scope.
- i18n for "Loading…" and fallback → Phase 4.
- The full `apiClient` abstraction used by later auth/cards endpoints
  → introduced where first needed (Phase 3).

## 3. Files to create / touch

- `frontend/src/lib/api.js` (new)
- `frontend/src/lib/api.test.js` (new)
- `frontend/src/App.jsx` (touch — add fetch)
- `frontend/src/App.test.jsx` (touch — cover new behavior)
- `frontend/vitest.config.js` (touch — add Tier A threshold entry
  for `src/lib/api.js`)

## 4. Seams involved

`fetch` — injected.

## 5. RED list

- **AC1**: `fetchHelloMessage` returns the `msg` string on a 200 JSON
  response.
  - test file: `frontend/src/lib/api.test.js`
  - test name: `"returns the msg string on a 200 JSON response"`
  - seams: `fetch` (fake)
- **AC2**: `fetchHelloMessage` throws on non-2xx responses.
  - test file: `frontend/src/lib/api.test.js`
  - test name: `"throws when the response status is not ok"`
- **AC3**: `App` renders the fetched message once it resolves.
  - test file: `frontend/src/App.test.jsx`
  - test name: `"renders the fetched message from /api/hello"`
  - seams: `fetch` (global, mocked via `vi.stubGlobal`)
- **AC4**: `App` falls back to the literal "LexiQuest" heading when
  the fetch rejects.
  - test name: `"falls back to the LexiQuest heading when the fetch fails"`

## 6. Assumptions

- `fetch` available globally in jsdom under Vitest 2.1 — no polyfill
  needed.
- Test uses `vi.stubGlobal("fetch", vi.fn())` per call, cleared in
  `afterEach`.

## 7. Risks

- `useEffect` fetching causes a React "act" warning if not awaited via
  `findBy*`. Mitigation: use `findByText` which auto-waits.
- `vi.stubGlobal` leakage between tests. Mitigation: `afterEach` cleanup.

## 8. Out-of-scope follow-ups

- Slice 5: README + manual `swa start` smoke.
- Phase 3: real `apiClient` with cookie handling and `requireAuth`.
- Phase 17: Error UI / offline detection.
