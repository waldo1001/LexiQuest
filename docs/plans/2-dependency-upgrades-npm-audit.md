# Plan — npm audit clean (#2)

Spec: [docs/specs/2-dependency-upgrades-npm-audit.md](../specs/2-dependency-upgrades-npm-audit.md)
Status: proposed (plan-waiting)

## Task

Clear high/critical `npm audit` findings in `api/` and `frontend/`: vitest 2 → 4.1.x (+ coverage-v8),
transitive patches via `npm audit fix`, remove unused `uuid`, sharp 0.35, Anthropic SDK to latest 0.x.

## Blast radius

Rating: breaking
Every task changes a dependency, and `api/package.json`, `frontend/package.json` and both lockfiles
are protected paths the League never edits. Spec §3 also says "Human-built. Do not apply `spec-approved`
for the League."

## Scope

IN: package.json and lockfiles in both projects, `frontend/vitest.config.js` exclude, `-- @preserve`
on the 73 `v8 ignore` hints (42 files), five frontend `vi.restoreAllMocks` sites, possible
`claude.ts` compile fixes, `.github/workflows/ci.yml` audit steps (operator).
OUT: vitest 5, React/Vite/ESLint majors, model changes.

## Files

See spec §10.

## Seams

None added. `ClaudeClient` / `FakeClaudeClient` unchanged.

## RED list

Copied from spec §5: AC1 audit exits 0 (verification command, no meta-test); AC2 both suites green on
vitest 4 with thresholds; AC3 per-file coverage of hinted files ≥ baseline; AC4 no `uuid`;
AC5 `npm run icons` on sharp 0.35; AC6 `npm run build` compiles `claude.ts` against the new SDK.

## Tasks

Spec §6 tasks 1–7, one commit each; tasks 2–6 ship without 7.

## Open questions

- None blocking; `v8 ignore next N` support in v4 to be measured (fallback: `start`/`stop`).

## Risks

Spec §9.

## Follow-ups

Vitest 5 on Node 22; React Router 7; leftover moderate findings.

## Why this stops here

The League cannot run `npm install`, `npm audit` or edit the protected manifests. Build by hand with
`/sdd-build` in a manual session on a `build/<slug>` worktree.
