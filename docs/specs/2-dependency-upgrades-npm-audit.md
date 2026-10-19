---
issue: 2
status: implemented
---

# `npm audit` clean: vitest 4 in both projects, transitive patches, unused `uuid` removed, sharp 0.35, Anthropic SDK current

Status: implemented, 2026-10-18 (section 12 records what was built and where it differs). Owner: waldo.
Scope: `api/package.json`, `frontend/package.json`, both lockfiles, both vitest configs, the 73
`v8 ignore` coverage hints, five frontend tests that call `vi.restoreAllMocks`, and the Anthropic
SDK wrapper's compile. Every claim below was verified against the tree at `60f14c0` (`main`) on
2026-10-18; audit numbers from `npm audit --json` in each project on that date. Not in scope:
vitest 5 (needs Node ≥ 22.12 and Vite ≥ 6.4; CI and Azure SWA run Node 20 —
`.github/workflows/ci.yml:34`, `azure-static-web-apps.yml:25`), React/Vite/ESLint majors, model
changes in `claude.ts`.

## 1. Goal

`/security-scan` step 8 blocks every TDD cycle on a high or critical `npm audit` finding. Both
projects have been red for months with lockfiles unchanged:

| Project | critical | high | moderate | total | Needs a major |
|---|---|---|---|---|---|
| `api/` | 3 | 6 | 5 | 14 | `vitest` 2.1 → 4.1.12, `@vitest/coverage-v8` 2.1 → 4.x, `vite` via vitest |
| `frontend/` | 2 | 14 | 4 | 21 (+1 low) | `vitest` 2.1 → 4.1.12, `sharp` 0.34.5 → 0.35.5 |

Direct findings: `vitest` (critical, via `@vitest/mocker` and `tinypool`), `@vitest/coverage-v8`
(critical, via vitest), `sharp` (high, libvips CVEs), `react-router-dom` (high, patch available).
Everything else is transitive with `fixAvailable: true` (patch): `brace-expansion`,
`fast-xml-builder`, `nanoid`, `postcss`, `source-map-js` (api); `@babel/plugin-transform-modules-systemjs`,
`browserslist`, `fast-uri`, `form-data`, `js-yaml`, `react-router`, `ws` (frontend).

Two facts that shape the plan:

- **`uuid` is unused.** `api/package.json:30` declares `uuid ^10` and `@types/uuid`; no file under
  `api/src` or `api/scripts` imports it — ids come from `node:crypto`'s `randomUUID` behind the
  `Random` seam (`api/src/shared/random.ts:1,12`). The audit's "uuid 10 → 14 major" is a removal.
- **`@anthropic-ai/sdk` is a moderate finding** (via `form-data`), not needed to clear the gate;
  the owner chose to bump it anyway as the last, separately shippable slice (2026-10-18). Installed
  0.90.0; the wrapper `createClaudeClient` (`api/src/shared/claude.ts:217-328`) is `v8 ignore`d and
  touches only `new Anthropic({ apiKey })`, `client.messages.create({ model, max_tokens, messages })`
  with `image`/`document` base64 blocks, and `msg.content.find((b) => b.type === "text")`. The SDK
  CHANGELOG from 0.91.0 to 0.135.x lists no breaking change to those (only beta Skills type renames
  in 0.122.0), checked 2026-10-18 at
  `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/CHANGELOG.md`.

After this change:

- `npm audit --audit-level=high` exits 0 in both projects; `/security-scan` passes without an owner
  override.
- Both suites run on vitest 4 with the same per-file thresholds (Tier A 90 / Tier B 70) and the same
  coverage picture (every `v8 ignore` hint still honoured).
- `api/` has no `uuid`; `frontend/` builds icons with sharp 0.35; the Anthropic SDK is current.

## 2. Behaviour after

Nothing family-visible. Developer-visible: `npm test` output format changes slightly (vitest 4
reporter: `verbose` is flat, `basic` is gone — the configs use the default reporter, unchanged);
`npm run icons` regenerates the same two PNGs in `frontend/public`.

## 3. Decisions

- **Target vitest 4.1.x, not 5.** Node 20 everywhere (CI, SWA runtime); vitest 4 requires Node ≥ 20
  and Vite ≥ 6 (frontend has vite 8.0.10; api gets vite through vitest). `@vitest/coverage-v8` must
  match the vitest major: pin both `^4.1.12`. Rejected: vitest 5 (Node 22.12).
- **Coverage hints get `-- @preserve`.** Vitest 4's v8 provider remaps from the AST of the
  transformed code; esbuild strips comments from TS and JSX unless they carry `@preserve`
  (v4 coverage guide, "Ignoring code"). The repo has 73 hints, none with `@preserve`
  (`grep -rn "@preserve" api/src frontend/src` → 0): 32 `start`/`stop` pairs, 18 `next`,
  1 `next 2`, 2 `next 3`. Rewrite them all as `/* v8 ignore next -- @preserve */` etc. The `next N`
  form is not documented for v4: measure first; if `streak.ts:43` (`next 3`), `PhotoImport.jsx:33`
  (`next 2`) and `PhotoImport.jsx:176` (`next 3`) lose coverage, convert them to `start`/`stop`.
  Rejected: lowering thresholds (never), `coverage.all`-style config (removed in v4).
- **Explicit `coverage.include` stays** (`api/vitest.config.ts:21`, `frontend/vitest.config.js:26`),
  which is what v4 needs now that `coverage.all` is gone; `test.exclude` is already explicit in api
  (`node_modules/**`, `dist/**`) and must be added to frontend (`dist/**`, `coverage/**`) because v4's
  default excludes shrink to `node_modules` and `.git`.
- **`vi.restoreAllMocks` semantics**: in v4 it only restores `vi.spyOn` spies and no longer resets
  `vi.fn` state. The five call sites (`UserStats.test.jsx:48`, `CourseStats.test.jsx:35`,
  `FamilyDashboard.test.jsx:44`, `CompareView.test.jsx:33`, `Leaderboard.test.jsx:30`) create fresh
  `vi.fn()` mocks per render helper (e.g. `Leaderboard.test.jsx:18`), so they need no reset; the
  calls become `vi.clearAllMocks()` or are removed, decided per file by whether a `vi.spyOn` exists.
- **Mock constructors**: v4 `vi.fn` implementations used with `new` must be `function`/`class`.
  No test calls `new` on a `vi.fn` (`grep "new (vi\.fn\|new mock\|vi\.fn(() => ({"` → 0 hits); the
  `vi.mock("@azure/functions")` factory in `api/src/index.test.ts` and the four
  `vi.mock("react-router-dom")` factories are object factories, unaffected.
- **Fake timers** (`StudySession.test.jsx`): v3 mocks every timer API including `performance.now`.
  Default: keep `vi.useFakeTimers()` and watch the speed-round timer tests; if they break, pass
  `{ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }`.
- **Remove `uuid` and `@types/uuid`** instead of upgrading. Rejected: bumping an unused package.
- **sharp `^0.35.5`**: `generate-icons.mjs` uses `resize`, `png`, `toFile`, `toBuffer`, `composite`
  — all stable. Rejected: dropping sharp and keeping only committed icons (the script is the source
  of the icons).
- **Anthropic SDK to the latest 0.x** as the last slice, with a live probe as the only real test
  (the wrapper is `v8 ignore`d by design; the `FakeClaudeClient` contract tests cover the seam, not
  the SDK). Rejected: pinning to the minimum fixing version (no such version; the finding is
  transitive) — go to current.
- **Human-built.** Every slice edits `api/package.json`, `frontend/package.json` or a lockfile,
  which the League's house floor and `.league.json` protect; this spec is built with `/sdd-build`
  by hand. Do not apply `spec-approved` to issue #2 for the League.

## 4. Contract

- `api/package.json` devDependencies: `vitest ^4.1.12`, `@vitest/coverage-v8 ^4.1.12`; dependencies:
  `uuid` and devDependency `@types/uuid` removed; `@anthropic-ai/sdk` → latest `0.x` at build time
  (`npm view @anthropic-ai/sdk version`), recorded in "Built, deviations".
- `frontend/package.json` devDependencies: `vitest ^4.1.12`, `@vitest/coverage-v8 ^4.1.12`,
  `sharp ^0.35.5`; dependencies `react-router-dom` patched by `npm audit fix`.
- `api/vitest.config.ts`, `frontend/vitest.config.js`: unchanged keys; frontend gains
  `exclude: ["node_modules/**", "dist/**", "coverage/**"]`; any v4 rename the config check reports is
  applied (none expected: no `poolOptions`, `workspace`, `threads` keys — `grep` → 0).
- Every coverage hint: `/* v8 ignore <form> -- @preserve */`.
- No change to `ClaudeClient` (`api/src/shared/claude.ts:45`), `FakeClaudeClient`
  (`api/testing/fake-claude-client.ts:19`), model constants (`SONNET_MODEL`, `HAIKU_MODEL`,
  `claude.ts:65,72`), or any handler.

## 5. Test plan (write first)

There is no new behaviour; the RED is the gate itself and the existing suites.

- AC1: `npm audit --audit-level=high` exits 0 in `api/` and in `frontend/`
  - test file: `api/src/__meta__/audit.test.ts` (new; `execFileSync("npm", ["audit", "--audit-level=high", "--offline"])` is not reliable offline — see §9; default: no meta-test, the `/security-scan` step 8 command is the check)
  - test name: n/a — verification command in §7
  - seams touched: none
- AC2: both suites green on vitest 4 with thresholds enforced per file
  - test file: the existing 66 api + 39 frontend test files (944 + 650 tests per the 2026-06-20 changelog, +13 since)
  - test name: all
  - seams touched: all fakes
  - edge cases: `vi.restoreAllMocks` sites; `useFakeTimers` in `StudySession.test.jsx`; `vi.mock` factories
- AC3: coverage hints still ignore what they ignored — per-file coverage of every file with a hint is ≥ its 2026-06-20 value
  - test file: the coverage report (`coverage/coverage-summary.json` when `json-summary` is added to reporters for the comparison; remove after)
  - test name: n/a — compare `lines`/`branches` per file before and after
  - edge cases: `next 2` / `next 3` forms
- AC4: `api` has no `uuid`: `grep -rn "uuid" api/src api/scripts api/package.json` → only `randomUUID`
- AC5: `npm run icons` succeeds on sharp 0.35 and `git status frontend/public` shows no unintended change
- AC6: `npm run build` (api `tsc`) compiles `claude.ts` against the new SDK; `FakeClaudeClient` contract tests green
  - test file: `api/src/shared/claude.test.ts`, `api/src/functions/cards-import.test.ts`, `cards-enrich.test.ts`
  - edge cases: `document` block type for PDF, `image` block media types (compile-time)

## 6. Tasks

1. **Baseline** (safe): run `npm run test:api` and `npm run test:frontend` with `json-summary` added
   to the reporters; keep `coverage/coverage-summary.json` of both under `$TMPDIR` as the before
   picture; `npm audit --json` of both likewise.
2. **api → vitest 4** (low-risk): bump `vitest` and `@vitest/coverage-v8` to `^4.1.12`, `npm install`
   in `api/`; add `-- @preserve` to the 61 api hints; run `npm run test:api`; compare per-file
   coverage with the baseline; convert `streak.ts:43` to `start`/`stop` if `next 3` is not honoured.
3. **frontend → vitest 4** (low-risk): same bump, `exclude` added to `vitest.config.js`, 12 hints
   `@preserve`d, the five `restoreAllMocks` sites adjusted, `npm run test:frontend`, coverage compare.
4. **Transitive patches** (safe): `npm audit fix` (never `--force`) in both; re-run both suites and
   `npm run build`; `npm audit --audit-level=high` → 0 in both. If a high finding remains that needs
   a major not in this spec, record it in "Built, deviations" and open an issue.
5. **Remove `uuid`** (safe): drop both entries, `npm install`, `npm run test:api`, `npm run build`.
6. **sharp 0.35** (safe): bump, `npm install`, `npm run icons`, inspect `git diff --stat frontend/public`.
7. **Anthropic SDK → latest 0.x** (risky — production import path): bump, `npm install`, `npm run
   build`, `npm run test:api`; read the CHANGELOG entries between 0.90.0 and the installed version
   for `messages.create`, `document`, `image`, `content` block types; then the operator step: `/local-smoke`
   plus a real `/api/cards/import` with one photo and one PDF through the running app
   (`/dev-start`), checking candidates arrive and the Import Review screen renders them.

Each task is one commit; tasks 2–6 ship without task 7.

## 7. Verification

- `npm run test:api && npm run test:frontend` green, per-file thresholds hold, totals in the report.
- `npm run build` green.
- `cd api && npm audit --audit-level=high` and `cd frontend && npm audit --audit-level=high` exit 0.
- Per-file coverage of every file carrying a `v8 ignore` hint ≥ baseline (table in "Built, deviations").
- `npm run icons` exit 0; `git diff --stat frontend/public` reviewed.
- `/security-scan` full pass with no owner override.
- Operator (task 7): `/local-smoke`, then `/dev-start` and one photo import + one PDF import.

## 8. Later, not in this spec

Vitest 5 when the runtime moves to Node 22; React Router 7 major if the patched 6.x line is retired;
the 5 moderate findings left after this spec, if any.

## 9. Risks and open questions

- `v8 ignore next N` may be unsupported in v4 (the guide documents `next`, `start/stop`, `if/else`,
  `file`). Default: convert the three `next N` hints to `start`/`stop` if the baseline comparison
  shows a drop.
- `@preserve` on 73 hints is noisy in a diff. Default: one commit per project, hint edits only.
- An `npm audit` meta-test needs the registry; CI has it, the League's sandbox does not. Default: no
  meta-test; `/security-scan` step 8 and CI are the checks (CI gains a `npm audit --audit-level=high`
  step per project as an operator edit to `ci.yml`, listed in §12).
- `npm audit fix` may bump `react-router-dom` across a minor with behaviour changes. Default: accept
  if the four `vi.mock("react-router-dom")` suites and the navigation tests stay green.
- The SDK's latest 0.x may require Node ≥ 20.x minor or change `HttpHeaders` types. Default: compile
  errors are fixed inside `createClaudeClient` only; if the API surface the wrapper uses changed,
  stop with `needs-answer` and the CHANGELOG line.
- Task 7's live probe costs real API calls. Default: one photo (the smoke fixture) and one short PDF.

## 10. Files

Changed: `api/package.json`, `api/package-lock.json`, `frontend/package.json`,
`frontend/package-lock.json`, `frontend/vitest.config.js`, the 42 files holding `v8 ignore` hints
(`grep -rln "v8 ignore" api/src frontend/src`), five frontend test files (§3), possibly
`api/src/shared/streak.ts` and `frontend/src/screens/PhotoImport.jsx` (hint form), possibly
`api/src/shared/claude.ts` (compile fixes only), `frontend/public/*.png` only if regenerated.
Operator: `.github/workflows/ci.yml` (audit steps).

## 11. Definition of Done

- [x] `npm audit --audit-level=high` exits 0 in both projects
- [x] Both suites green on vitest 4, thresholds unchanged and enforced
- [ ] Per-file coverage ≥ baseline for every hinted file — superseded, see §12 (deviation D1): vitest 4's AST recount makes the literal vitest-2 baseline inapplicable; every hinted file instead meets its Tier A/B threshold and every `@preserve` hint is honoured
- [x] `uuid` gone; `npm run icons` green on sharp 0.35; SDK bumped — live probe explicitly deferred (operator step, see §12)
- [x] The four invariants' meta-tests pass; `/security-scan` full pass
- [x] `docs/changelog.md` bullet, `docs/setup.md` prerequisites (Node 20 stays, no change), `PROGRESS.md` section, this spec `status: implemented` + "12. Built, deviations"

## 12. Built, deviations (2026-10-18)

Built by hand with `/sdd-build` (manual takeover from the League — see below),
one commit per task, tasks 2–7. The core goal is met: **`npm audit
--audit-level=high` exits 0 in both `api/` and `frontend/`**, and `/security-scan`
passes with no owner override.

**What was built (per slice):**

- Slice 2 — `api` `vitest` + `@vitest/coverage-v8` → `^4.1.12`; all 74 `v8 ignore`
  comment lines re-marked `-- @preserve`; per-file coverage gaps from vitest 4's
  new counting closed (see D1).
- Slice 3 — `frontend` `vitest` + `@vitest/coverage-v8` → `^4.1.12`;
  `test.exclude: ["node_modules/**","dist/**","coverage/**"]` added to
  `vitest.config.js`; 11 frontend `v8 ignore` lines `@preserve`d (incl. the
  `tts.js` custom-reason hint); the five `vi.restoreAllMocks()` sites →
  `vi.clearAllMocks()` (none uses `vi.spyOn`); `AppContext` theme-validation
  branches covered.
- Slice 4 — `npm audit fix` (no `--force`) in both; `react-router-dom` 7.14.2 →
  7.18.4 among the patches; the four `vi.mock("react-router-dom")` suites and
  navigation tests stay green.
- Slice 5 — `uuid` + `@types/uuid` removed from `api` (unused; ids come from
  `node:crypto` `randomUUID` behind the `Random` seam).
- Slice 6 — `sharp` → `^0.35.5`; `npm run icons` green (see D5).
- Slice 7 — `@anthropic-ai/sdk` 0.90.0 → **0.135.0** (latest 0.x; no 1.x exists).

**Verified (commands + totals, final tree):**

- `npm run test:api` → 986 passed, 1 skipped (integration); Tier A 90% per file holds.
- `npm run test:frontend` → 659 passed; Tier A 90% / Tier B 70% per file hold.
- `npm run build` → exit 0 (`tsc` compiles `claude.ts` against SDK 0.135.0 with no change; `vite build` green).
- `cd api && npm audit --audit-level=high` → exit 0 (1 low advisory remains: `esbuild`, below the gate — §8).
- `cd frontend && npm audit --audit-level=high` → exit 0 (0 vulnerabilities).
- `/security-scan` → PASS; the four invariants' meta-tests (`__meta__`, 29 tests) pass.
- `node scripts/validate-specs.js docs/specs/2-dependency-upgrades-npm-audit.md` → pass.

**AC → test traceability:**

| AC | How verified |
|---|---|
| AC1 audit exits 0 | `npm audit --audit-level=high` in each project (exit 0); verification command, no meta-test (§9) |
| AC2 both suites green on vitest 4, thresholds enforced | `npm run test:api` (986) + `npm run test:frontend` (659), per-file thresholds enforced |
| AC3 hinted-file coverage | superseded — see D1; all hinted files meet their threshold, `@preserve` honoured |
| AC4 no `uuid` | package + types removed; `grep` finds only `randomUUID` and the `Random` seam |
| AC5 `npm run icons` on sharp 0.35 | `npm run icons` exit 0; regenerated PNGs pixel-identical (D5) |
| AC6 build compiles claude.ts; FakeClaudeClient contract tests | `npm run build` exit 0; `claude.test.ts`, `cards-import.test.ts`, `cards-enrich.test.ts` green |

**Deviations:**

- **D1 — AC3 baseline comparison superseded.** The spec assumed vitest 4 would
  keep "the same coverage picture." It does not: `@vitest/coverage-v8` 4.x uses
  `ast-v8-to-istanbul` (no opt-out) and counts branches/functions far more
  granularly (api function total 208 → 343), so per-file percentages are not
  comparable to the 2026-06-20 vitest-2 figures and a literal "≥ baseline" is not
  satisfiable. With the owner's decision (2026-10-18) to **keep the floor rather
  than relax thresholds**, the gaps were closed instead: real tests for reachable
  logic (cards-batch rename validation, the `session-signer` valid-HMAC/non-JSON
  tamper path, cross-user family scans, multi-day stats trends, upload recency
  sort, `AppContext` theme fallbacks) and `/* v8 ignore … -- @preserve */` on
  genuinely defensive type-guards (`req.method ?? …`, `params?.x ?? ""`,
  `match[1] ?? ""`, a `cardById.get()?… ?? ""`, two unreachable `session-signer`
  catch blocks are left uncovered but the file clears 90%). `@preserve` itself is
  honoured — near-fully-ignored files (`azure-table-storage.ts`, `claude.ts`,
  `bcrypt-password-hasher.ts`) still pass. All Tier A 90% / Tier B 70% per-file
  thresholds hold; none were changed.
- **D2 — hint counts.** The real tree has **85** `v8 ignore` comment lines across
  **37** files (74 api / 11 frontend), not the spec's "73 hints / 42 files"; the
  three `next N` forms are exactly where §3 said (`streak.ts:43`,
  `PhotoImport.jsx:33`, `PhotoImport.jsx:176`) and all were preserved. `next N`
  turned out to work under v4 (no conversion to `start`/`stop` needed).
- **D3 — react-router already on v7.** The spec described a "patched 6.x line";
  the tree is on `react-router-dom` ^7, so `npm audit fix` patched within v7
  (7.14.2 → 7.18.4).
- **D4 — live import probe deferred (operator).** Task 7's `/local-smoke` + real
  `/api/cards/import` on a photo + a PDF needs `/dev-start`, `ANTHROPIC_API_KEY`
  and real (billed) API calls, so it is left as an operator step. The SDK bump is
  compile- and contract-test-verified (`claude.ts` unchanged); the DoD's "or
  explicitly deferred" clause applies.
- **D5 — regenerated icons not re-committed.** `npm run icons` succeeds on sharp
  0.35; the two non-maskable PNGs differ only in encoder metadata (verified
  pixel-identical to the committed ones via raw-RGBA compare), so the committed
  icons are kept to avoid binary churn (AC5: no unintended visual change).
- **D6 — `restoreAllMocks` → `clearAllMocks`.** The spec allowed "clearAllMocks or
  removed, per file"; all five sites use fresh `vi.fn()` and no `vi.spyOn`, so they
  became `vi.clearAllMocks()`. The suite was already green before the change.

**Build provenance (deviation from the normal path):** issue #2 had the
`spec-approved` label applied and the League had started a build (draft PR on
`league/2-npm-audit-clean-vitest-4-in-both-project`, phase `clone`). Per §3 this
spec is human-build-only (every slice edits protected `package.json`/lockfiles).
On the owner's instruction the League build was stopped, the stray `spec-approved`
label removed from #2, and the build continued by hand on that same branch.

**Operator steps still open:**

- The live import probe (D4): `/local-smoke`, then `/dev-start` and one photo
  import + one PDF import through the running app.
- `ci.yml` audit steps (§13 item 3): add `npm --prefix api audit
  --audit-level=high` and `npm --prefix frontend audit --audit-level=high`.
- `/deploy-swa` when ready (push to `main` deploys).

## 13. Proposed edits to other files (applied 2026-10-18, see section 12)

- **[applied]** `docs/changelog.md`: the 2026-10-18 bullet (SDK version 0.135.0; live probe deferred as an operator step rather than run).
- **[applied]** `PROGRESS.md`: removed the Open-specs line (now `None open.`); added `## Post-v1 — Dependency upgrades (npm audit clean)`.
- **[operator — open]** `.github/workflows/ci.yml`: add `npm --prefix api audit --audit-level=high` and `npm --prefix frontend audit --audit-level=high` steps after install (operator edit, not applied by the build).
- **[applied]** `docs/tdd/coverage-policy.md`: `v8 ignore` hints must carry `-- @preserve` (esbuild strips the comment otherwise under vitest 4).
- **[applied]** `.claude/skills/security-scan/SKILL.md` step 8: the gate is `--audit-level=high`, so moderate and low findings do not block.
