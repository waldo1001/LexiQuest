---
phase: 3
slice: 5
name: frontend UserPicker + Login + Home screens
status: proposed
---

# Phase 3 · Slice 5 — Frontend auth screens

## 1. Task

Replace the `App` shell with routing across three screens:
`UserPicker` (picks an avatar) → `Login` (password) →
`Home` (greeting + logout). Uses the `/api/users/public`, `/api/login`,
`/api/me`, `/api/logout` endpoints already shipped.

## 2. Scope (IN / OUT)

**IN**

- `react-router-dom` dep added to `frontend`.
- `src/lib/api.js` grows: `fetchPublicUsers()`, `login(userId, pw)`,
  `fetchMe()`, `logout()`. All take injected `fetchFn` for testing.
- `src/screens/UserPicker.jsx` — renders avatars, click → navigate
  to `/login/:id`.
- `src/screens/Login.jsx` — password input, `login(id, pw)`,
  navigates to `/home` on success, shows error on 401.
- `src/screens/Home.jsx` — calls `fetchMe()`, renders
  `<h1>Hello, {name}</h1>` + logout button.
- `App.jsx` — router + route definitions; top-level
  `AppContext`-free (context comes in Phase 4).
- Tests at Tier B 70% floor for the screens; Tier A for api.js.

**OUT**

- i18n strings — all English for now. Phase 4 switches in Dutch +
  `<html lang>` sync.
- Styling beyond plain HTML.
- Route guards (Phase 4 adds `AppContext`). For now, Home simply
  shows "Loading…" / "401 — click picker" on auth failure.

## 3. Files

- `frontend/package.json` — add `react-router-dom`.
- `frontend/src/lib/api.js` — extend.
- `frontend/src/lib/api.test.js` — extend.
- `frontend/src/screens/UserPicker.jsx` + `.test.jsx`
- `frontend/src/screens/Login.jsx` + `.test.jsx`
- `frontend/src/screens/Home.jsx` + `.test.jsx`
- `frontend/src/App.jsx` (rewrite) + `.test.jsx` (rewrite).
- `frontend/vitest.config.js` — add Tier A entry for new api.js
  (already pinned).

## 4. Seams

`fetch` (DI into api.js).

## 5. RED list

api.js:
- **N1**: `fetchPublicUsers({fetchFn})` returns the JSON array.
- **N2**: `fetchPublicUsers` throws on non-ok.
- **N3**: `login({userId,password}, {fetchFn})` POSTs JSON body,
  returns `{id,name,isAdmin,ui_language}` on 200.
- **N4**: `login` throws on 401 with a friendly message.
- **N5**: `fetchMe({fetchFn})` GETs and returns JSON; throws on 401.
- **N6**: `logout({fetchFn})` POSTs; resolves void.

Screens:
- **U1**: `UserPicker` renders fetched users, each a button.
- **U2**: Clicking a user navigates to `/login/:id`.
- **L1**: `Login` submits → `login()` → navigate `/home` on success.
- **L2**: `Login` shows error text on rejected login.
- **H1**: `Home` renders `Hello, Alice` after `fetchMe`.
- **H2**: `Home` logout button calls `logout()` + navigates to `/`.

## 6. Assumptions

- `MemoryRouter` in tests; `BrowserRouter` in production.
- `react-router-dom` v7 is the current major.
- Cookie-based auth means we can just call `fetch`, no explicit
  token passing.

## 7. Risks

- React 19 StrictMode double-invokes effects in dev; tests use
  `findBy*` which auto-waits.
- Vite's HMR vs jsdom — tests use `@testing-library/react`
  `render`, no HMR interference.

## 8. Out-of-scope

- Phase 4 i18n.
