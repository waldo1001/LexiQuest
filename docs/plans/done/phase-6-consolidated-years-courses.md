---
phase: 6
slice: 1-3 (consolidated)
name: Years & Courses — API CRUD + Frontend CourseList + AdminPanel year management
status: proposed
---

# Phase 6 (consolidated) — Years & Courses

Per user directive, Phase 6's three original slices are merged into one
TDD cycle. The methodology still applies in full; only the per-slice
approval gate and commit cadence are collapsed.

## 1. Task

Expose admin-managed `/api/years` CRUD and owner-or-admin `/api/courses`
CRUD, add a `CourseList` screen with a "New course" modal for the current
year, and surface year management in the `AdminPanel`.

## 2. Scope boundary

**IN**

- Backend `/api/years`:
  - `GET /api/years` (any authenticated user) → list of years sorted by
    `start_date` descending.
  - `POST /api/years` (admin only) → create year; validates label format,
    dates, `is_current` boolean. When `is_current: true`, atomically
    unsets `is_current` on all other years.
  - `PUT /api/years/:id` (admin only) → update label, dates, and/or
    `is_current`. Same "set current → unsets others" rule.
- Backend `/api/courses`:
  - `GET /api/courses?userId=` (authenticated) → courses for a user;
    `userId` defaults to caller's session `userId` when absent. Any
    authenticated user may read any other user's courses (read-only
    browsing is explicit in Design.md §5.8).
  - `POST /api/courses` (authenticated) → always creates for
    `session.userId` — request body `user_id` is ignored (invariant 1).
    Required fields: `name`, `emoji`, `color`, `default_mode`,
    `year_id`. Optional: `language` (BCP-47 string or `null`).
  - `PUT /api/courses/:id` (owner or admin) → update any of
    name/emoji/color/language/default_mode. `user_id` and `year_id` are
    immutable in this slice.
  - `DELETE /api/courses/:id` (owner or admin) → deletes the course row
    and cascades delete of all cards in that course's partition.
- Frontend:
  - `frontend/src/screens/CourseList.jsx` — grid of current-year
    courses for the logged-in user, with Edit/Delete per course and a
    "New course" button that opens a modal form.
  - "New course" modal form fields: `name`, `emoji`, `color`,
    `language` (dropdown: none / fr-FR / nl-BE / en-GB / de-DE),
    `default_mode` (dropdown: ask / self_grade / mcq / mixed). Submits
    to `POST /api/courses` with `year_id` of the current year.
  - Edit course — inline or reuse the modal with existing values.
  - `frontend/src/screens/AdminPanel.jsx` — new "Years" section with
    table + "New year" + Edit + "Set current" button, wired to
    `/api/years`.
  - `frontend/src/lib/api.js` — wrappers: `fetchYears`, `createYear`,
    `updateYear`, `fetchCourses`, `createCourse`, `updateCourse`,
    `deleteCourse`.
  - `App.jsx` — `/courses` route (auth required; uses current-year
    scoping internally).
  - `Home.jsx` — add a visible link to `/courses` for all authenticated
    users.
  - i18n keys under `courses.*` and `admin.years.*` in EN + NL.

**OUT**

- `DELETE /api/years/:id` — Design.md Phase 6 only lists GET / POST /
  PUT for years. Deferred; not needed by the phase smoke test.
- Card CRUD — Phase 7.
- SM-2 defaults on course creation — cards don't exist yet, so nothing
  to default.
- Year CRUD UI beyond the AdminPanel section — out of scope.
- Mobile polish / dark mode — Phase 17.

## 3. Files to create / touch

### API (TypeScript)

- `api/src/functions/years.ts` — handler factory + registration for
  `GET /api/years`, `POST /api/years`.
- `api/src/functions/years.test.ts` — unit tests.
- `api/src/functions/years-id.ts` — handler factory for
  `PUT /api/years/:id`.
- `api/src/functions/years-id.test.ts` — unit tests.
- `api/src/functions/years-shared.ts` — `validateYearCreate`,
  `validateYearPatch`, `yearProfile`, `applyCurrentFlag` helper
  (clears `is_current` on siblings).
- `api/src/functions/years-shared.test.ts` — unit tests for the
  validators and helper.
- `api/src/functions/courses.ts` — handler factory for
  `GET /api/courses`, `POST /api/courses`.
- `api/src/functions/courses.test.ts` — unit tests.
- `api/src/functions/courses-id.ts` — handler factory for
  `PUT /api/courses/:id`, `DELETE /api/courses/:id`.
- `api/src/functions/courses-id.test.ts` — unit tests.
- `api/src/functions/courses-shared.ts` — `validateCourseCreate`,
  `validateCoursePatch`, `courseProfile`,
  `deleteCourseAndCascadeCards` helper.
- `api/src/functions/courses-shared.test.ts` — unit tests.
- `api/src/functions/user-cascade.ts` — already deletes courses + cards;
  after REFACTOR, re-route it through the new
  `deleteCourseAndCascadeCards` helper so there is one definition of
  "delete a course".
- `api/src/shared/seed.ts` — add a `CourseRow` typed interface (for
  reuse across handlers and cascade).

### Frontend (JavaScript)

- `frontend/src/lib/api.js` — add 7 wrappers listed above.
- `frontend/src/lib/api.test.js` — add coverage.
- `frontend/src/screens/CourseList.jsx` — new screen.
- `frontend/src/screens/CourseList.test.jsx` — new tests.
- `frontend/src/screens/AdminPanel.jsx` — add Years section.
- `frontend/src/screens/AdminPanel.test.jsx` — extend tests.
- `frontend/src/screens/Home.jsx` — add `/courses` link.
- `frontend/src/screens/Home.test.jsx` — extend tests.
- `frontend/src/App.jsx` — add `/courses` route.
- `frontend/src/App.test.jsx` — route smoke check.
- `frontend/src/i18n/strings.js` — `courses.*`, `admin.years.*` keys in
  EN + NL.

## 4. Seams involved

- `tables` (read + write on `years`, `courses`, `cards`)
- `signer` (via `requireAuth`)
- `clock` (for `created_at`)
- `random` (for new row IDs)
- frontend `fetchFn` (for `api.js` wrappers)

No new seams. No Claude. No TTS. No hasher needed for this slice (years
and courses have no passwords).

## 5. RED test list

### `api/src/functions/years-shared.test.ts`

- YS1: `validateYearCreate` rejects non-object / missing / empty
  `label`.
- YS2: `validateYearCreate` rejects `start_date` / `end_date` that
  aren't `YYYY-MM-DD`.
- YS3: `validateYearCreate` rejects `is_current` that isn't boolean.
- YS4: `validateYearCreate` returns `{ ok: true, value }` on a valid
  body.
- YS5: `validateYearPatch` accepts partial updates (any subset of the
  four fields).
- YS6: `validateYearPatch` rejects unknown field types same as create.
- YS7: `applyCurrentFlag` clears `is_current` on all sibling rows when
  the given year is marked current; no-op when `is_current` is false or
  omitted.

### `api/src/functions/years.test.ts`

- Y1: `GET` returns 401 without session cookie.
- Y2: `GET` returns 401 with an invalid cookie.
- Y3: `GET` returns 200 with empty array when no years exist.
- Y4: `GET` returns 200 with all years sorted by `start_date` desc.
- Y5: `POST` returns 401 without session cookie.
- Y6: `POST` returns 403 when caller is non-admin.
- Y7: `POST` returns 400 on invalid body.
- Y8: `POST` returns 201 with the created year profile and persists
  it; `created_at`? (years don't have `created_at` per §3.2 — confirm
  no field).
- Y9: `POST` with `is_current: true` unsets `is_current` on all other
  existing years.
- Y10: Unsupported methods → 405.

### `api/src/functions/years-id.test.ts`

- YI1: `PUT` returns 401 without session.
- YI2: `PUT` returns 403 when non-admin.
- YI3: `PUT` returns 400 on invalid body.
- YI4: `PUT` returns 404 when year id unknown.
- YI5: `PUT` returns 200 with updated profile on happy path.
- YI6: `PUT` with `is_current: true` unsets `is_current` on all
  siblings.
- YI7: `PUT` without `is_current` does NOT touch siblings.
- YI8: Missing id param → 400.
- YI9: Unsupported method → 405.

### `api/src/functions/courses-shared.test.ts`

- CS1: `validateCourseCreate` rejects non-object / missing required
  fields (`name`, `emoji`, `color`, `default_mode`, `year_id`).
- CS2: `validateCourseCreate` rejects invalid `default_mode`.
- CS3: `validateCourseCreate` accepts `language: null` and BCP-47
  strings (`fr-FR`, `nl-BE`, `en-GB`, `de-DE`).
- CS4: `validateCourseCreate` rejects a non-null non-BCP-47 language
  (e.g. `"zz"`).
- CS5: `validateCoursePatch` accepts partial mutations of
  name/emoji/color/language/default_mode only.
- CS6: `validateCoursePatch` rejects attempts to mutate `user_id` or
  `year_id` (ignored/stripped).
- CS7: `deleteCourseAndCascadeCards` removes every row in
  `cards` partitioned by the course id, then removes the course row
  itself.

### `api/src/functions/courses.test.ts`

- C1: `GET` returns 401 without session cookie.
- C2: `GET` without `?userId=` returns the caller's courses.
- C3: `GET ?userId=<other>` returns the other user's courses
  (read-only browsing allowed).
- C4: `GET` returns courses sorted by `name` ascending.
- C5: `GET` returns 200 with `[]` when target user has none.
- C6: `POST` returns 401 without session.
- C7: `POST` returns 400 on invalid body.
- C8: `POST` returns 201 with course profile and persists it using
  `partitionKey: session.userId`, NEVER the body's `user_id`
  (invariant 1 — LexiQuest meta-test re-assertion via direct test).
- C9: `POST` stores `created_at` from `clock.now()` and id from
  `random.uuid()`.
- C10: `POST` accepts `language: null` and stores `null`.
- C11: Unsupported method → 405.

### `api/src/functions/courses-id.test.ts`

- CI1: `PUT` returns 401 without session.
- CI2: `PUT` returns 404 when course id unknown in caller's partition
  AND not reachable as admin.
- CI3: `PUT` returns 403 when a non-admin, non-owner caller targets
  another user's course.
- CI4: `PUT` returns 200 when owner updates their own course.
- CI5: `PUT` returns 200 when admin updates anyone's course
  (admin override).
- CI6: `PUT` ignores body attempts to mutate `user_id` / `year_id`
  (row retains original values).
- CI7: `DELETE` returns 401 without session.
- CI8: `DELETE` returns 404 when id unknown.
- CI9: `DELETE` returns 403 for non-admin non-owner.
- CI10: `DELETE` returns 204 for owner; cascades cards in the course
  partition.
- CI11: `DELETE` returns 204 for admin against someone else's course;
  cascades cards.
- CI12: Unsupported method → 405.

### `frontend/src/lib/api.test.js`

- A-Y1: `fetchYears` GETs `/api/years` with credentials and returns
  body; throws on non-ok.
- A-Y2: `createYear` POSTs JSON to `/api/years` and returns body;
  throws `forbidden` on 403.
- A-Y3: `updateYear` PUTs `/api/years/:id` and returns body;
  throws `forbidden` on 403, `not_found` on 404.
- A-C1: `fetchCourses(userId?)` GETs `/api/courses` or
  `/api/courses?userId=<id>` and returns the list.
- A-C2: `createCourse` POSTs JSON, returns the course.
- A-C3: `updateCourse` PUTs the patch, returns updated course; throws
  `forbidden` / `not_found`.
- A-C4: `deleteCourse` DELETEs; throws `forbidden` / `not_found` on
  those statuses; resolves void on 204.

### `frontend/src/screens/CourseList.test.jsx`

- CL1: Renders loading indicator initially.
- CL2: Lists courses returned by `fetchCourses` (scoped to the current
  user) in a grid, each showing `emoji` + `name`.
- CL3: Clicking "New course" opens a modal with all fields; submitting
  calls `createCourse` with the entered values plus `year_id` of the
  current year (fetched from `fetchYears`) and appends the new course.
- CL4: Language dropdown includes `none`, `fr-FR`, `nl-BE`, `en-GB`,
  `de-DE`; choosing `none` submits `language: null`.
- CL5: Edit button opens an edit form per row; submitting calls
  `updateCourse` and replaces the row.
- CL6: Delete button confirms and calls `deleteCourse`, removes the
  row.
- CL7: Shows a visible error when an API call fails.
- CL8: Renders in Dutch under `lang="nl"`.
- CL9: When no current year exists, shows an empty-state message and
  disables "New course".

### `frontend/src/screens/AdminPanel.test.jsx` (extensions)

- AP-Y1: AdminPanel renders a Years section listing years from
  `fetchYears`, sorted by `start_date` desc.
- AP-Y2: "New year" form submits to `createYear` and appends the year
  to the list.
- AP-Y3: "Set current" button on a year row calls
  `updateYear(id, { is_current: true })` and reflects the change
  (exactly one row is current afterwards).
- AP-Y4: Edit form on a year row submits `updateYear`.

### `frontend/src/screens/Home.test.jsx`

- H1: Shows a "My courses" link for every authenticated user.
- (existing admin-link tests remain green)

### `frontend/src/App.test.jsx`

- APP1: `/courses` path mounts the `CourseList` screen.

## 6. Open questions / assumptions

- **Assumption**: The "current year" for CourseList is derived by
  calling `fetchYears()` and picking the row with `is_current: true`.
  No separate `/api/years/current` endpoint is added.
- **Assumption**: `POST /api/courses` requires the client to pass
  `year_id` explicitly. The server does NOT auto-fill the current year
  server-side — the frontend is responsible for sending the
  `is_current` year. This keeps the API pure and testable.
- **Assumption**: `language` is validated only as "null or a
  BCP-47-shaped string" (`/^[a-z]{2,3}(-[A-Z]{2})?$/`). We do NOT
  maintain a hard allowlist — Design.md §3.2 uses "..." to indicate
  it's open-ended.
- **Assumption**: `DELETE /api/years/:id` is deferred. Design.md Phase
  6 tasks list only GET/POST/PUT for years.
- **Assumption**: Admin override for courses is derived from
  `auth.isAdmin === true` OR `course.user_id === session.userId`.
- **Assumption**: The frontend modal is a plain HTML `<dialog>` or a
  conditionally-rendered form — no new dependency, keeps Tier B tests
  honest.
- **Assumption**: `Home.jsx` gains a `/courses` link visible to all
  authenticated users; the existing `/admin` link stays admin-only.
- **Assumption**: Per auto-memory feedback, the PLAN file is written
  but approval is not awaited; one commit is made at the end of this
  consolidated slice (rather than one per original sub-slice) because
  the user explicitly asked to concatenate.

## 7. Risks

- **Invariant 1 drift**: easiest place to regress. Mitigated by test
  C8 (body `user_id` ignored) and the existing
  `auth-boundary.test.ts` meta-test which covers the new handlers
  automatically (it scans `api/src/functions/`).
- **`applyCurrentFlag` race**: two admins toggling "current" at the
  same time could leave multiple `is_current` rows. Acceptable for a
  4-user family app; the test asserts single-writer correctness.
- **Cascade on course delete**: `user-cascade.ts` already walks
  `cards` by course partition. After refactor the two code paths
  (user-delete cascading courses, course-delete cascading cards) must
  share `deleteCourseAndCascadeCards` so a future change updates both.
- **Frontend size**: `CourseList` + modal could exceed the 300-line
  cap. Splitting into `CourseList.jsx` + `CourseFormModal.jsx` is
  acceptable during REFACTOR.
- **Coverage**: new files must clear Tier A (90%) for `api/` and
  `frontend/src/lib/`, Tier B (70%) for `screens/`. Plan the tests to
  cover every branch up front.

## 8. Out-of-scope follow-ups

- `DELETE /api/years/:id` — add when a real need appears (e.g. admin
  cleaning up a mistakenly-created year).
- `GET /api/years/current` — if the "fetch years and filter" pattern
  proves awkward in later phases, collapse it.
- Course archiving (soft-delete) — not in Design.md.
- Phase 6 tag: after REVIEW + commit + push, apply `phase-6-done`.
