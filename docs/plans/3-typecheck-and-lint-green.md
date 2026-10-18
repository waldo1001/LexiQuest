# Plan — typecheck and lint green (#3)

Spec: [docs/specs/3-typecheck-and-lint-green.md](../specs/3-typecheck-and-lint-green.md)
Status: approved (rated risky; owner waldo approved the plan, 2026-10-18)

## Blast radius

Rating: risky
The spec edits `frontend/src/context/AppContext.jsx` (theme derivation, hooks moved to `app-hooks.js`), which is on the risky list. The remaining tasks are safe (test typings, helpers, lint config) or low-risk (five fetch screens, `StudySession`).

## Task

Make `npm run typecheck` (295 test-typing errors) and `npm run lint` (23 errors) exit 0. Enforce both through two meta-tests inside `npm test`.

## Scope

IN:
- `api/testing/{http,rows}.ts` helpers with their tests.
- The 33 api test files fixed by category.
- `frontend/eslint.config.js` and `vitest.config.js`.
- Keyed-fetch-state refactor of 5 screens.
- `AppContext` theme derivation.
- `app-hooks.js` move, updating 12 import sites.
- `StudySession` ref-write move.
- Unused-var fixes.
- Two meta-tests.

OUT:
- Dependency upgrades.
- New ESLint rules.
- Any family-visible behaviour change.
- Operator-only edits: `.github/workflows/ci.yml` and `.league.json` (protected paths, listed as operator steps).

## Files

See spec §10.

## Seams

fetch (fakes), clock (fake timers in `StudySession` tests). Otherwise child process only.

## RED list

Copied from spec §5, AC1–AC12:
- AC1: `typecheck: tsc -p tsconfig.test.json reports no errors`
- AC2: `lint: eslint . reports no errors`
- AC3: `bodyOf returns jsonBody of an HttpResponseInit; throws on HttpResponse`
- AC4: `makeSessionRow defaults satisfy SessionRow; overrides win`
- AC5–AC9: per-screen "shows loading again when the range changes"
- AC10: `theme follows user.settings.theme on login and the manual override until the user changes`
- AC11: existing `StudySession` flush tests
- AC12: the lint meta-test (react-refresh rule)

## Slices

Spec §6 order: (1) lint config and trivial fixes plus lint meta-test RED; (2) api helpers plus typecheck meta-test RED; (3) api test fixes (a)–(f); (4) hook refactors per file, then `AppContext`, then `StudySession`.

## Open questions

None.

## Risks

- `AppContext` theme derivation may expose a screen that relied on the one-render-late update.
- `exactOptionalPropertyTypes` may reject `undefined` overrides in the factories.
- The typecheck meta-test adds about 10 s to the api run.

## Follow-ups

- Operator steps after merge: restore the `typecheck` and `lint` steps in `ci.yml`, add both commands to `.league.json`, then re-probe in the HUD.
- A shared `useFetch` hook (spec §8).
