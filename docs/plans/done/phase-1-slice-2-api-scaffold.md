---
phase: 1
slice: 2
name: api scaffold + hello function
status: proposed
---

# Phase 1 · Slice 2 — Scaffold `api/` (Azure Functions TS) + `hello/`

## 1. Task

Scaffold the `api/` subproject as an Azure Functions v4 Node.js 20 TypeScript
app with a single HTTP-triggered `hello` function returning
`{ "msg": "Hello from LexiQuest" }`, and wire Vitest per the Tier A
coverage policy.

## 2. Scope boundary

**IN**

- `api/package.json` with Azure Functions v4 programming-model deps:
  `@azure/functions`, and dev-deps from `testing/api.package.deps.json`
  (vitest, coverage, typescript, @types/node, tsx).
- `api/tsconfig.json` (Node 20, strict) and `api/tsconfig.test.json`
  copied from `testing/`.
- `api/vitest.config.ts` copied from `testing/vitest.config.api.ts`.
- `api/host.json` (Functions v4, extension bundle v4.x).
- `api/.funcignore` minimal.
- `api/local.settings.json.example` (documented, not real) with
  `FUNCTIONS_WORKER_RUNTIME=node`,
  `AzureWebJobsStorage=UseDevelopmentStorage=true`. **No real
  secrets.**
- `api/src/functions/hello.ts` — HTTP trigger registering a `hello`
  function with route `hello` (reachable as `/api/hello` under SWA),
  returning `{ msg: "Hello from LexiQuest" }`.
- Functions app entry `api/src/index.ts` that imports
  `./functions/hello` so registration happens at startup.
- `api/src/functions/hello.test.ts` — unit test that invokes the
  handler directly with a fake `HttpRequest` and asserts the JSON body.
- `.gitignore` confirmation: `api/dist/`, `api/node_modules/`,
  `api/local.settings.json` already excluded by root `.gitignore`.
- `api/package.json` scripts: `build` (tsc), `start` (func start),
  `test`, `test:watch`, `typecheck`.

**OUT (deferred)**

- `staticwebapp.config.json` → Slice 3.
- GitHub Actions workflow + Azure provisioning → Slice 3.
- Frontend calling `/api/hello` → Slice 4.
- Table Storage seam, bcrypt, session signer → Phase 2+.
- `@anthropic-ai/sdk`, `@azure/data-tables` → later phases.
- The "not-found" / error-path branches beyond the happy path — the
  `hello` endpoint has no failure modes worth exercising in this slice.

## 3. Files to create / touch

- `api/package.json` (new)
- `api/tsconfig.json` (new)
- `api/tsconfig.test.json` (new, from `testing/`)
- `api/vitest.config.ts` (new, from `testing/`)
- `api/host.json` (new)
- `api/.funcignore` (new)
- `api/local.settings.json.example` (new)
- `api/src/index.ts` (new — import-side-effects registration point)
- `api/src/functions/hello.ts` (new)
- `api/src/functions/hello.test.ts` (new)

## 4. Seams involved

`none` — the `hello` function has no dependencies. It's a literal
constant returned from an HTTP trigger. This slice establishes the
test surface that later slices will inject seams into.

## 5. RED test list

- **AC1**: `hello` returns HTTP 200 with JSON body `{ msg: "Hello from LexiQuest" }`.
  - test file: `api/src/functions/hello.test.ts`
  - test name: `"returns 200 and 'Hello from LexiQuest' as JSON"`
  - seams touched: `none`
  - edge cases: none (happy path only; no auth, no inputs, no branches).
  - test calls the handler function directly with a minimal fake
    `HttpRequest` + `InvocationContext`; it does NOT boot the Functions
    host.

## 6. Open questions / assumptions

- **Assumption**: Azure Functions v4 Node programming model
  (`@azure/functions@^4`). This is the current recommended shape as of
  2026 — it lets us write plain TypeScript handlers and unit test them
  without a live Functions host.
- **Assumption**: handlers exported as named const `hello` + registered
  via `app.http("hello", { handler: hello, ... })`. The test imports
  the exported handler directly, not the registration side-effect.
- **Assumption**: `"type": "module"` in `api/package.json` — ESM is
  the path of least friction with modern Vitest + tsx. If Functions
  runtime complains later we'll switch to CJS in Slice 3 when deploy
  is tested.
- **Assumption**: `hello` route anon auth level (matches Design.md
  Phase 1 intent — no auth yet).
- **No real env values** get committed; `local.settings.json.example`
  is a template only.

## 7. Risks

- Azure Functions + ESM can be finicky; if `func start` fails in a
  later slice we may need to drop ESM (`"type": "module"`) or move to
  a build step that emits CJS. Isolated to Slice 3's smoke-test.
- `@azure/functions` v4 may have shifted APIs (minor). Mitigation:
  pin the major via caret range and fix the test if needed.
- TypeScript strict mode + `exactOptionalPropertyTypes` can surface
  type errors in the test's fake `HttpRequest`. Mitigation: construct
  only the fields the handler actually reads, cast via
  `as unknown as HttpRequest` at the boundary (see testability-patterns
  for the "minimal fake at the seam" idiom).
- Rollback: `rm -rf api/` and redo — no other code depends on it yet
  (frontend is independent).

## 8. Out-of-scope follow-ups

- Slice 3: `staticwebapp.config.json` + GitHub Actions workflow + Azure
  SWA provisioning (user-facing step for Azure portal).
- Slice 4: `fetch('/api/hello')` from `App.jsx`, render `msg`.
- Slice 5: root `README.md` — stack, local dev, `swa start`.
- Phase 2: introduce `TableStorage`, `Clock`, `Random`, `Logger`,
  `PasswordHasher` seams.
