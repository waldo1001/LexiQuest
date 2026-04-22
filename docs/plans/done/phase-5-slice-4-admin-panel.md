---
phase: 5
slice: 4
name: Admin Panel screen + route guard
status: proposed
---

# Phase 5 · Slice 4 — Admin Panel screen

## 1. Task

Add `/admin` route with an Admin Panel screen that lists users, adds
new users, edits fields, resets passwords, and deletes users — guarded
so only admins can reach it.

## 2. Scope boundary

**IN**

- `frontend/src/screens/AdminPanel.jsx` — users table + "New user"
  form + inline "Reset password" + Delete with confirm.
- Route guard wrapper `frontend/src/screens/AdminRoute.jsx` — fetches
  `/api/me`, redirects to `/home` if `isAdmin !== true`.
- `App.jsx` route wiring: `/admin` → `<AdminRoute><AdminPanel/></AdminRoute>`.
- `frontend/src/lib/api.js` wrappers: `fetchUsers`, `createUser`,
  `updateUser`, `deleteUser`.
- i18n keys under `admin.*`.
- Home link to `/admin` visible only when `me.isAdmin === true`.

**OUT**

- Year management — Phase 6.
- Course management — Phase 6.
- Backend changes — Slice 2 / 3 already done.
- Dark-mode / mobile-nav polish — Phase 17.

## 3. Files to create / touch

- `frontend/src/lib/api.js` — add 4 wrappers.
- `frontend/src/lib/api.test.js` — add coverage for the 4 wrappers.
- `frontend/src/screens/AdminPanel.jsx` — new screen.
- `frontend/src/screens/AdminPanel.test.jsx` — new tests.
- `frontend/src/screens/AdminRoute.jsx` — new guard.
- `frontend/src/screens/AdminRoute.test.jsx` — new tests.
- `frontend/src/App.jsx` — wire `/admin` route.
- `frontend/src/App.test.jsx` — route wiring sanity.
- `frontend/src/screens/Home.jsx` — show admin link when `isAdmin`.
- `frontend/src/screens/Home.test.jsx` — admin-link visibility cases.
- `frontend/src/i18n/strings.js` — admin.* keys in EN + NL.

## 4. Seams involved

- `fetchFn` — injected into every api wrapper. Tests pass mocks.
- Route — `MemoryRouter` in tests.

## 5. RED test list

### `api.test.js`

- A1: `fetchUsers` GETs `/api/users` and returns the array.
- A2: `fetchUsers` throws on 401 / non-ok.
- A3: `createUser` POSTs JSON to `/api/users`, returns the profile.
- A4: `createUser` throws `"forbidden"` on 403, `"duplicate"` on 409.
- A5: `updateUser` PUTs `/api/users/{id}` with the given patch.
- A6: `updateUser` throws on 404 / non-ok.
- A7: `deleteUser` DELETEs `/api/users/{id}` and resolves void on 204.
- A8: `deleteUser` throws on non-ok.

### `AdminRoute.test.jsx`

- G1: shows loading while `fetchMe` pending.
- G2: renders children when `fetchMe` returns `isAdmin: true`.
- G3: redirects to `/home` when `fetchMe` returns `isAdmin: false`.
- G4: redirects to `/` when `fetchMe` throws (no session).

### `AdminPanel.test.jsx`

- P1: lists users returned by `fetchUsers`, sorted by name.
- P2: shows a "New user" form that submits to `createUser` with the
  form fields and appends the new user to the list.
- P3: edit button opens an inline edit form that submits to
  `updateUser` and updates the row.
- P4: "Reset password" prompt calls `updateUser({ password })` and
  shows a success status message.
- P5: delete button confirms and calls `deleteUser`, removes the row.
- P6: delete is disabled (or hidden) for the current user's own row
  (defense in depth; backend also 403s).
- P7: renders in Dutch under `lang="nl"`.
- P8: surfaces a visible error when an API call fails.

### `App.test.jsx`

- An unchanged set plus: `/admin` mounts the `AdminPanel` via
  `AdminRoute` (can be a smoke check — full behavior is in
  `AdminRoute.test`).

### `Home.test.jsx`

- H1: admin link renders when `me.isAdmin === true`.
- H2: admin link absent when `me.isAdmin === false`.

## 6. Open questions / assumptions

- **Assumption**: The reset-password flow uses `window.prompt`. For a
  family tool this is acceptable; it matches Design.md §6 Phase 5 task
  description ("Reset password action: prompt + PUT"). We inject the
  `prompt` function in tests.
- **Assumption**: "Current user id" for the self-delete guard comes
  from `useAppContext().user?.id` OR from an extra `fetchMe()` call
  the guard already made. We thread the admin's id down via a prop
  from `AdminRoute` so `AdminPanel` doesn't refetch.
- **Assumption**: No pagination / search yet — 4 users max.
- **Assumption**: Emoji + color are free-text inputs (not color picker
  / emoji picker widgets). Keeps Tier-B scope honest.

## 7. Risks

- Route-guard flicker: `AdminRoute` must not render children even for
  one paint when `fetchMe` is pending. Mitigated by explicit loading
  state.
- Redirect loop if `fetchMe` on `/admin` sends us to `/home` which
  then re-renders `AdminRoute`. Guard is only on `/admin`, so no loop.
- `window.prompt` in JSDOM — inject it.

## 8. Out-of-scope follow-ups

- Phase 5 smoke test → tag `phase-5-done`.
- Phase 6: years + courses CRUD, admin year management surfaced here.
