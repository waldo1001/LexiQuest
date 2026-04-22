# Testing toolchain — drop-in for LexiQuest

These files are templates. Copy the relevant ones into `api/` or
`frontend/` when those projects are scaffolded in Phase 1.

## Files

### API (TypeScript)

- [vitest.config.api.ts](vitest.config.api.ts) — Vitest config for the
  `api/` project with Tier A (90%) thresholds per
  [../docs/tdd/coverage-policy.md](../docs/tdd/coverage-policy.md).
- [api.package.deps.json](api.package.deps.json) — dev dependencies to add
  to `api/package.json`.
- [tsconfig.test.json](tsconfig.test.json) — TypeScript config extension
  for tests (strict, no emit, Vitest globals).

### Frontend (JavaScript)

- [vitest.config.frontend.js](vitest.config.frontend.js) — Vitest config
  for the `frontend/` project with **split thresholds**: Tier A (90%) for
  `src/lib/**`, Tier B (70%) for `src/screens/**` + `src/components/**` +
  `src/charts/**`.
- [frontend.package.deps.json](frontend.package.deps.json) — dev
  dependencies to add to `frontend/package.json`.

### Examples

[examples/](examples/) — worked scaffolds showing the testability patterns
for LexiQuest's seams. Use as reference when writing the first real tests.

- [examples/fake-clock.example.ts](examples/fake-clock.example.ts) — fake
  `Clock` with `advance(ms)` / `setDate(iso)`.
- [examples/fake-table-storage.example.ts](examples/fake-table-storage.example.ts)
  — Map-backed `TableStorage` fake covering all 6 tables, row-key range
  queries, and JSON field serialization.
- [examples/fake-claude-client.example.ts](examples/fake-claude-client.example.ts)
  — scriptable `ClaudeClient` fake with markdown-fence handling and
  injectable failure modes.

## Why these exist outside `api/` and `frontend/`

Before Phase 1, neither subproject exists — just this repo root with
`Design.md` and `PROGRESS.md`. These templates live here so the moment
`api/` and `frontend/` are scaffolded in Phase 1, the first
`/tdd-cycle` can pull them in without reinventing the config.

## Installation (during Phase 1)

```sh
# in api/ (Azure Functions, TypeScript)
cd api
npm init -y
# merge devDependencies + scripts from ../testing/api.package.deps.json
npm install
cp ../testing/vitest.config.api.ts ./vitest.config.ts
cp ../testing/tsconfig.test.json ./tsconfig.test.json
mkdir -p testing
# port fake-*.example.ts into api/testing/ as real source files (drop ".example")

# in frontend/ (Vite + React, JS)
cd ../frontend
# vite scaffolded this — merge frontend.package.deps.json into package.json
npm install
cp ../testing/vitest.config.frontend.js ./vitest.config.js
mkdir -p src/testing
# port any fakes the frontend needs (FakeTts, FakeApiClient) into src/testing/
```

Then run `npm test` in each project. With zero tests, Vitest reports
"no test files found" — that's the correct starting state. The first real
test is the first RED in the first `/tdd-cycle`.
