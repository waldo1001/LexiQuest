---
issue: 3
status: draft
---

# `npm run typecheck` and `npm run lint` go green and join CI and the League's gate

Status: proposed, 2026-10-18. Owner: waldo.
Scope: api test typings, the frontend ESLint config, eight frontend files flagged by the React
Compiler rules, two new meta-tests, then `ci.yml` and `.league.json` (operator steps). Every claim
below was verified against the tree at `60f14c0` (`main`) on 2026-10-18. Not in scope: dependency
upgrades (spec 2), any behaviour change visible to the family, new ESLint rules.

## 1. Goal

Both quality gates are red on `main`, so neither runs in CI nor in the League's build commands
(`.github/workflows/ci.yml:41-44` comment, `.league.json` `commands`). Measured on 2026-10-18 with
`npm run typecheck` (= `tsc -p tsconfig.test.json` in `api/`) and `npm run lint` (= `eslint .` in
`frontend/`):

**Typecheck: 295 errors, all in test files** (`api/tsconfig.test.json` includes `**/*.test.ts` and
the `__meta__`/`__integration__`/`__contract__` folders; `api/tsconfig.json` excludes tests, so
`npm run build` is green). By category:

| Count | Error | Cause (one sample) |
|---|---|---|
| 98 | TS2339 `jsonBody` does not exist on `HttpResponseInit \| HttpResponse` | handlers are typed as `HttpHandler` from `@azure/functions` 4.13, whose return is the union; tests read `res.jsonBody` (`api/src/functions/me.test.ts:77`) |
| 59 | TS2554 Expected 2 arguments, but got 1 | `buildSessionCookie(token)` — the helper takes `(token, secure)` (`api/src/shared/session-cookie.ts:4`); tests call it with one argument (`api/src/__meta__/stats-privacy.test.ts:84`) |
| 51 + 22 + 11 + 9 + 8 | TS2532 / TS18048 possibly `undefined` | `noUncheckedIndexedAccess` on test array reads, e.g. `stored[0].question_lang` (`api/src/functions/cards-batch.test.ts:307`) |
| 11 + 4 | TS2322 / TS2739 `settings` is a `string`, not the settings object | fixtures still write `settings: "{}"`; `UserRow.settings` became a typed object (`api/src/functions/cards-batch.test.ts:99`) |
| 5 + 1 | TS2739 / TS2322 `SessionRow` missing `game_type`, `card_limit`, `card_order` | session fixtures predate the gaming-mode fields (`api/src/functions/attempts.test.ts:77`) |
| 2 | TS7053 `Content-Disposition` / `Cache-Control` not on `HttpHeadersInit` | `api/src/functions/export.test.ts:134` indexes the headers union with a string |
| rest | `Overload`, `Record<string, unknown> \| undefined` | `api/src/shared/pptx-extractor.test.ts:82-93` and a few handler tests |

Most affected files: `cards-import.test.ts` (53), `stats-upload.test.ts` (35), `cards-batch.test.ts`
(24), `leaderboard.test.ts` (16), `cards-copy.test.ts` (16).

**Lint: 23 errors, 5 warnings** (`frontend/eslint.config.js` = `@eslint/js` recommended +
`eslint-plugin-react-hooks` 7.1 flat recommended + `eslint-plugin-react-refresh` vite):

| Count | Rule | Where |
|---|---|---|
| 7 | `react-hooks/set-state-in-effect` | `AppContext.jsx:89`, `CourseStats.jsx:20`, `FamilyDashboard.jsx:21`, `Leaderboard.jsx:15`, `UploadStats.jsx:28`, `UserStats.jsx:27` (one each; `AppContext` is the theme sync) |
| 3 | `react-hooks/refs` | `StudySession.jsx:228-230` — `flushRef.current.* = state.*` during render |
| 10 | `no-unused-vars` | `Avatar.test.jsx:1` (`screen`), `OfflineBanner.test.jsx:2` (`vi`), `dark-mode.test.jsx:1` (`vi`), `CourseList.jsx:74-75` (`user`, `navigate`), `ImportReview.jsx:16` (`courseName`), `SessionResults.jsx:28` (`mode`), `StudySession.test.jsx:1,4` (`within`, `beforeEach`), `fake-tts.js:15` (`_lang`) |
| 2 | `react-refresh/only-export-components` | `AppContext.jsx:119,127` — `useAppContext` and `useTts` exported from the provider file |
| 2 | `no-undef` | `setup.js:4` (`global`), `vitest.config.js:20` (`process`) — browser globals only |
| 8 blank-rule errors | parse errors on `coverage/block-navigation.js`, `coverage/lcov-report/*.js` | `globalIgnores(['dist'])` does not ignore `coverage/` |

After this change:

- `npm run typecheck` and `npm run lint` exit 0 on `main`.
- Both run in `ci.yml` and are listed in `.league.json` `commands`, so a League build cannot go green
  with a type error in a test or a lint error.
- Both are also enforced from inside `npm run test:api` / `npm run test:frontend` by a meta-test
  each, so the League's existing allowlist covers them before the `.league.json` edit lands.
- No screen behaves differently; every existing screen test stays green.

## 2. Behaviour after

Nothing family-visible changes. Developer-visible: `npm run typecheck`, `npm run lint`, `npm test`
all green; CI shows two more steps; a lint or type error fails `npm test` with the tool's own output
quoted in the assertion message.

## 3. Decisions

- **Fix the tests' types, do not relax `tsconfig.test.json`.** `strict`, `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes` are the repo's rules (`api/tsconfig.json:10-12`). Rejected:
  `"strict": false` for tests (hides real fixture drift such as the `settings` string), excluding
  tests from the typecheck (then the script checks nothing `npm run build` does not).
- **One typed test helper for responses, `bodyOf(res)`**, in `api/testing/http.ts`: narrows the
  `HttpResponseInit | HttpResponse` union (throws if given an `HttpResponse` instance, which no
  handler returns) and returns `jsonBody` typed as the caller's generic. Rejected: casting at 98
  sites, or changing handler return types to `HttpResponseInit` (the composition root registers them
  as `HttpHandler`; changing production types for tests is backwards).
- **Fixture factories** `makeSessionRow(overrides)` and `makeUserRow(overrides)` in
  `api/testing/rows.ts` with every required field defaulted, so the next new row field is a
  one-line change. Rejected: patching the 6 + 15 fixtures in place (the same drift returns).
- **Refactor the hook-rule hits, do not downgrade the rules** (owner's decision, 2026-10-18).
  - Data-fetch screens (`CourseStats`, `FamilyDashboard`, `Leaderboard`, `UploadStats`,
    `UserStats`): the effect calls `setData(null)` synchronously to show the loading state when the
    parameters change. Replace with state keyed by the request parameters
    (`const [result, setResult] = useState({ key: null, data: null })`, `key = \`${courseId}|${range}\``)
    and derive `data = result.key === key ? result.data : null` during render; the effect only sets
    state in `.then`/`.catch` guarded by `cancelled`. Loading, error and refetch behaviour stay
    identical. Rejected: `useReducer` per screen (more code, same outcome), a shared `useFetch` hook
    (changes every screen at once; can follow later).
  - `AppContext.jsx:89`: the effect copies `user.settings.theme` into local theme state after login.
    Derive instead: keep a local override set by `setThemeName`, and compute
    `themeName = override ?? user?.settings?.theme ?? DEFAULT`; reset the override to `null` when the
    user changes (in the same handler that sets `user`, not in an effect). `dark-mode.test.jsx` and
    `AppContext.test.jsx` pin the behaviour.
  - `StudySession.jsx:228-230`: the three ref writes during render move into
    `useEffect(() => { flushRef.current = { ...flushRef.current, sessionId, pendingAttempts, firstTryResults }; })`
    (no dependency array: runs after every render, so the unmount/pagehide cleanup still reads the
    latest state). `StudySession.test.jsx` has the flush-on-unmount tests.
- **`useAppContext` and `useTts` move to `frontend/src/context/app-hooks.js`**; `AppContext.jsx`
  keeps the provider and re-exports nothing (12 import sites update). Rejected: a
  `react-refresh/only-export-components` disable comment (the rule is right: Fast Refresh of the
  provider file currently remounts consumers).
- **Meta-tests make the gates part of `npm test`**: `api/src/__meta__/typecheck.test.ts` runs
  `tsc -p tsconfig.test.json` with `execFileSync` and asserts exit 0, quoting the first 20 error
  lines; `frontend/src/__meta__/lint.test.js` does the same with `eslint .`. Cost: ~10-15 s added to
  each project's run. Reason: the League can only run what `.league.json` lists and cannot edit that
  file; with the meta-tests, `npm run test:api` / `npm run test:frontend` already enforce both gates
  for League builds. Rejected: waiting for the operator step only.

## 4. Contract

- `api/testing/http.ts`: `export function bodyOf<T = Record<string, unknown>>(res: HttpResponseInit | HttpResponse): T` and `export function headersOf(res: HttpResponseInit | HttpResponse): Record<string, string>`.
- `api/testing/rows.ts`: `makeSessionRow(overrides?: Partial<SessionRow>): SessionRow` (defaults: `game_type: "classic"`, `card_limit: null`, `card_order: "random"`, timestamps `"2026-01-01T00:00:00.000Z"`), `makeUserRow(overrides?: Partial<UserRow>): UserRow` (`settings` = the default settings object from `api/src/shared/settings.ts` or wherever `UserSettings` defaults live — the coder cites the file).
- `frontend/src/context/app-hooks.js`: `export function useAppContext()`, `export function useTts()` (bodies unchanged).
- `frontend/eslint.config.js`: `globalIgnores(['dist', 'coverage'])`; a second config object for `['vitest.config.js', 'src/testing/**']` with `languageOptions.globals: { ...globals.node, ...globals.vitest }` (or `globals.browser` plus `global`/`process`).
- `frontend/src/screens/*.jsx` fetch state shape: `{ key: string | null, data: T | null }` — internal, no prop or API change.
- `api/src/__meta__/typecheck.test.ts`, `frontend/src/__meta__/lint.test.js`: one test each, `execFileSync` on the project's own binary (`node_modules/.bin/tsc`, `node_modules/.bin/eslint`), 60 s timeout, excluded from coverage like the other `__meta__` files (frontend `vitest.config.js` `include` must gain `src/__meta__/*.test.js`, and coverage `exclude` gains `src/__meta__/**`).

## 5. Test plan (write first)

- AC1: `tsc -p tsconfig.test.json` exits 0 in `api/`
  - test file: `api/src/__meta__/typecheck.test.ts`
  - test name: "typecheck: tsc -p tsconfig.test.json reports no errors"
  - seams touched: none (child process)
  - edge cases: the assertion message contains the first lines of tsc output when red
- AC2: `eslint .` exits 0 in `frontend/`
  - test file: `frontend/src/__meta__/lint.test.js`
  - test name: "lint: eslint . reports no errors"
  - seams touched: none
  - edge cases: warnings do not fail (exit 0 with warnings is a pass); `coverage/` is ignored even when present
- AC3: `bodyOf` narrows the union and throws on an `HttpResponse` instance
  - test file: `api/testing/http.test.ts`
  - test name: "bodyOf returns jsonBody of an HttpResponseInit; throws on HttpResponse"
  - seams touched: none
  - edge cases: `jsonBody` undefined → returns `undefined` typed as T (caller asserts)
- AC4: `makeSessionRow` / `makeUserRow` satisfy the row types with no overrides and accept overrides
  - test file: `api/testing/rows.test.ts`
  - test name: "makeSessionRow defaults satisfy SessionRow; overrides win"
  - seams touched: none
  - edge cases: `settings` override merges shallowly
- AC5–AC9: each refactored fetch screen keeps its loading → data → error behaviour and shows the loading state again when `range` (or `period`) changes
  - test files: `CourseStats.test.jsx`, `FamilyDashboard.test.jsx`, `Leaderboard.test.jsx`, `UploadStats.test.jsx`, `UserStats.test.jsx` (existing tests + one new "shows loading again when the range changes" per screen where missing)
  - seams touched: fetch (fakes already injected)
  - edge cases: a response for a stale key arriving after the key changed is ignored
- AC10: `AppContext` theme: login applies `user.settings.theme`; a manual theme change wins until the next login; logout/user switch resets the override
  - test file: `frontend/src/context/AppContext.test.jsx` (+ `dark-mode.test.jsx` stays green)
  - test name: "theme follows user.settings.theme on login and the manual override until the user changes"
  - seams touched: none
  - edge cases: unknown theme name in settings is ignored
- AC11: `StudySession` flush-on-unmount still sends the pending attempts recorded in the latest render
  - test file: `frontend/src/screens/StudySession.test.jsx` (existing flush tests)
  - seams touched: fetch, clock (fake timers already used in this file)
  - edge cases: unmount immediately after an answer (ref updated by the post-render effect)
- AC12: `useAppContext` / `useTts` import from `context/app-hooks.js` everywhere; the provider file exports only the component
  - test file: `frontend/src/__meta__/lint.test.js` (the react-refresh rule is the check)
  - seams touched: none

## 6. Tasks

1. **Lint config + trivial fixes** (safe): `eslint.config.js` ignores and globals; remove the 10 unused
   identifiers (or prefix the intentional `_lang` per the existing `varsIgnorePattern` — it already
   allows `^[A-Z_]`, so `_lang` fails only because the pattern is anchored to uppercase; rename to
   `_LANG` or drop the parameter); add the lint meta-test RED (23 errors) → GREEN after the rule
   refactors below. Ship this slice with the meta-test marked `it.skip` only if the hook slices are
   not yet in — no: the slice order below makes it green at the end of task 4; keep RED visible until then.
2. **api test helpers** (safe): `bodyOf`, `headersOf`, `makeSessionRow`, `makeUserRow` with their
   tests (AC3, AC4). Typecheck meta-test written RED (295).
3. **api test fixes by category** (safe, one commit each): (a) `buildSessionCookie(token, false)` at
   59 sites (a `cookieFor(deps, userId)` helper in `api/testing/` is fine); (b) `bodyOf` at 98 sites;
   (c) fixtures through the factories (21 sites); (d) index access: `?.` or `at()` with a non-null
   assertion only where the test asserted the length just before (≈100 sites); (e) headers via
   `headersOf`; (f) `pptx-extractor.test.ts` guards. After (f): typecheck meta-test GREEN.
4. **Hook-rule refactors** (low-risk, one slice per file): `Leaderboard`, `CourseStats`,
   `UploadStats`, `UserStats`, `FamilyDashboard` (AC5–AC9, Tier B ≥70% re-proven per file), then
   `AppContext` (AC10) and the hooks move to `app-hooks.js` (AC12), then `StudySession` (AC11).
   After the last: lint meta-test GREEN.
5. **Operator steps** (human, after merge — the League cannot edit these files): add
   `npm run typecheck` and `npm run lint` steps back into `.github/workflows/ci.yml` (replace the
   comment at lines 41-44) and append `"npm run typecheck"`, `"npm run lint"` to `.league.json`
   `commands`; Re-probe in the Jarvis HUD.

## 7. Verification

- `npm run typecheck` → exit 0; `npm run lint` → exit 0, warnings allowed.
- `npm run test:api` and `npm run test:frontend` green, thresholds hold; the two meta-tests are
  listed in the output.
- Tier B per file for the six refactored frontend files and `AppContext.jsx` (≥70%, currently
  `StudySession.jsx` 93.8%, see `docs/changelog.md` 2026-06-20).
- `npm run build` green (api `tsc`, frontend `vite build`).
- Operator: `/local-smoke`, then a manual pass through Stats → change range, Leaderboard → change
  period, a study session answered and closed mid-way (flush), theme switch after login.

## 8. Later, not in this spec

A shared `useFetch(key, loader)` hook replacing the five keyed-state copies; turning the 5 remaining
lint warnings (`react-hooks/exhaustive-deps` 3, `react-refresh` 2 in other files) into errors.

## 9. Risks and open questions

- The keyed-state refactor changes *when* the loading state appears by one render (derived in render
  instead of after the effect). Default: accept; the new per-screen test asserts the loading text is
  visible synchronously after the parameter change.
- `exactOptionalPropertyTypes` may reject `{ card_limit: undefined }` overrides. Default: factories
  take `Partial<Row>` and callers omit keys rather than pass `undefined`.
- The typecheck meta-test adds ~10 s to `npm run test:api`. Default: accept; if it exceeds 20 s on
  CI, move it to a separate script and keep only the CI step.
- The League cannot build task 5 (house-floor protected). Default: the builder lists it as an
  operator step in "Built, deviations" and the owner applies it right after merge.
- `AppContext` theme derivation: if a screen relied on the one-render-late theme update, a test will
  show it. Default: derive, as above.

## 10. Files

New: `api/testing/http.ts`, `api/testing/http.test.ts`, `api/testing/rows.ts`, `api/testing/rows.test.ts`,
`api/src/__meta__/typecheck.test.ts`, `frontend/src/__meta__/lint.test.js`, `frontend/src/context/app-hooks.js`.
Changed: `frontend/eslint.config.js`, `frontend/vitest.config.js` (include/exclude for `__meta__`),
`frontend/src/context/AppContext.jsx` (+ test), `frontend/src/screens/{CourseStats,FamilyDashboard,Leaderboard,UploadStats,UserStats,StudySession,CourseList,ImportReview,SessionResults}.jsx` (+ tests),
`frontend/src/components/{Avatar,OfflineBanner}.test.jsx`, `frontend/src/context/dark-mode.test.jsx`,
`frontend/src/testing/{setup.js,fake-tts.js}`, 12 files importing `useAppContext`/`useTts`,
the 33 api test files listed by `npm run typecheck`. Operator: `.github/workflows/ci.yml`, `.league.json`.

## 11. Definition of Done

- [ ] `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] AC1–AC12 each have the named test, green
- [ ] Tier A on `api/testing/*.ts` helpers, Tier B on every touched screen; no new `v8 ignore`
- [ ] The four invariants' meta-tests still pass; `/security-scan` pass
- [ ] `docs/changelog.md` bullet; `PROGRESS.md` section; this spec `status: implemented` with "12. Built, deviations"
- [ ] Operator steps applied after merge: `ci.yml` steps, `.league.json` commands, HUD Re-probe green

## 12. Proposed edits to other files (not applied)

- `docs/changelog.md`: "- Made **typecheck and lint green** and part of every test run: 295 test-typing errors fixed through `bodyOf`/`headersOf` helpers and row factories; 23 lint errors fixed, including the React Compiler rules in six screens and `AppContext` (keyed fetch state derived in render, ref updates moved to a post-render effect) and the hooks moved to `context/app-hooks.js`; `coverage/` ignored by ESLint. Two meta-tests now fail `npm test` on a type or lint error. CI runs both steps again. Spec: [specs/3-typecheck-and-lint-green.md](specs/3-typecheck-and-lint-green.md)."
- `PROGRESS.md`: remove the Open-specs line; add `## Post-v1 — Typecheck and lint green` with the slices above.
- `.github/workflows/ci.yml`: replace the comment at lines 41-44 with the two steps (`npm run typecheck`, `npm run lint`) before the api test step.
- `.league.json`: `"commands"` += `"npm run typecheck"`, `"npm run lint"`.
- `docs/getting-started.md` "Other test commands": `npm run typecheck` / `npm run lint` are green and run by CI.
