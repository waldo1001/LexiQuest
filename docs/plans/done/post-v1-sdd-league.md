# LexiQuest — GitHub League (waldo.Jarvis) + Spec Driven Development

## Context

waldo.Jarvis's **GitHub League** drafts specs from GitHub issues and builds approved specs on
`league/<issue>-<slug>` branches, opening draft PRs labelled `league-building`. LexiQuest was already
onboarded by the League-ready PR #1 (merged `5a4d8a3`): `.league.json`, the operator section in
`CLAUDE.md`, a one-line `docs/specs/README.md`, and two **stub** skills (`/sdd-draft` = "stop,
needs-answer", `/sdd-build` = forward to `/tdd-cycle`). There is no spec convention, and the League
cannot run a single test here (`commands: []`, no root `package.json`, CI builds but never tests).

waldo.BCObservatory (`origin/main`, PRs #2/#4/#6/#7) is the reference for SDD with the League:
`docs/specs/<slug>.md` with `issue`/`status` frontmatter, 12 fixed sections, a human spec skill
(`bcobs-spec`), real `sdd-draft` / `sdd-build` / `sdd-review` skills, a frontmatter test, and
approval = the owner applying the `spec-approved` label on the issue (never a frontmatter edit).

Goal: the same practices in LexiQuest, adapted to its TDD toolchain (`/tdd-cycle`, `/security-scan`,
`/docs-update`, PROGRESS.md, changelog), so the League can draft and build here for real.

### Hard constraints verified in the Jarvis source

- **Build-job Bash** = only the `.league.json` `commands` entries, matched at the repo root
  (`services/league/src/permissions.ts`): no `cd`, no shell metacharacters, `<subdir>:<cmd>` entries
  never match (SDK Bash has no `cwd`), npm flags `--prefix/--cwd/--config/--root*` denied. Every
  entry is also re-run by the League on the final commit (`measure.ts`), so keep the list lean.
  `pre_build` entries run without a shell at the worktree root and are only checked for
  metacharacters (`--prefix` is fine there). Root `npm ci` runs only when a root lockfile exists.
- **Draft job** writes exactly ONE new file matching `docs/specs/*.md`, basename `<issue>-…`,
  `status: draft`; no tests, no `gh`, no commit, no `node_modules`; may run only
  `node scripts/validate-specs.js` and only if that exact string is in `commands` (`draft.ts`).
- Spec parsing (`ready-units.ts`): `---` on line 1, `issue: <n>` (else leading digits of the file
  name), `status:` first word, title = first `# ` heading. `README.md` is ignored (no digits, no issue)
  and must never get frontmatter.
- Plan gate (`plan-gate.ts`): reads the plan's `## Blast radius` section; the first line containing
  exactly one of `safe|low-risk|risky|breaking` is the rating; a line with two words is ambiguous →
  treated as `risky` (plan-waiting). The more severe of file rating and report wins.
- Skills are vetted before each build (`spawn.ts`): frontmatter keys only
  `name/description/when_to_use/argument-hint/arguments/version/disable-model-invocation/user-invocable/paths/license`,
  no inline shell, no symlinks, `.md/.txt/.json` only.
- CI gate: each `ci_required` workflow must be active and green **on the PR head sha**. A push-only
  workflow can never satisfy it.
- No repo workflow may apply `spec-approved`, `league-building`, `league-handed-over`, `league-halted`.
- House floor (League never edits): `.github/**`, `.claude/**`, root `package.json` (root only!),
  `**/package-lock.json`, `.league.json`, `.env*`. Plans are read from `docs/plans/*.md`.
- Report JSON: build `{outcome: built|plan-waiting|needs-answer|failed, plan_path, blast_radius, question, tests:{command,passed,failed}, red_evidence, files[], notes}`;
  draft `{outcome: drafted|failed, spec_path}`. `CI=1` and `JARVIS_OPERATOR=1` are set in the child env.

## Decisions (two revise the earlier question round — say so if you disagree)

1. **Root wrapper `package.json`, NOT npm workspaces.** Workspaces would break production: Oryx runs
   `npm install` inside `api/`, npm ≥7 walks up, finds the workspace root and hoists to the root
   `node_modules`; the SWA action then packages `api/` without `@azure/functions`, `@azure/data-tables`,
   `bcryptjs` → every API route 500s, while `swa start` locally still works (walks up to root). Also
   `frontend/package.json` has an `overrides` block that npm honours only in a root package. So: root
   `package.json` with scripts only, no deps, no workspaces; the two sub-lockfiles stay; a trivial root
   `package-lock.json` keeps the League's root `npm ci` a no-op; sub-installs come from `pre_build`.
2. **SWA deploy workflow becomes push-to-main only; a new `CI` workflow is the only `ci_required`.**
   SWA PR previews copy the production app settings (production Table Storage + Anthropic key) into
   every preview, and the Free plan caps previews at 3 — League draft + build PRs would run against
   family data and the 4th open PR would go red. The SWA workflow therefore can't be a PR gate; `CI`
   builds both projects instead, so the deploy path is still exercised on every PR.
3. Spec file name `docs/specs/<issue>-<slug>.md` (Jarvis requires the prefix). Humans create the issue
   first, like `bcobs-spec`.
4. PROGRESS.md gets an owner-maintained `## Open specs` list (added by `/lexiquest-spec` in manual mode
   or by the owner at approval). The meta-test checks "listed → valid frontmatter", never the reverse
   (a League draft cannot touch PROGRESS.md).
5. The League runs `/security-scan` and `/docs-update` (LexiQuest's definition of done), so
   `docs/changelog.md`, `user-guide.md`, PROGRESS.md are editable. `protected` =
   `["api/package.json","frontend/package.json","api/host.json","staticwebapp.config.json","api/scripts/**"]`
   (dependencies and routing are operator steps by construction; the League can edit a sub
   `package.json` but never its lockfile, so letting it would break `npm ci`). `Design.md` is **risky**
   (plan-waiting), not protected: specs legitimately amend it.
6. One PR on branch `sdd/league-setup` (never `league/*`), `.league.json` in the last commit; the
   `CI` workflow becomes active the moment the merge lands, same commit as the manifest.

## Implementation steps (in order)

### 0. Housekeeping
- Write this plan to `docs/plans/post-v1-sdd-league.md` (CLAUDE.md step 0; `/docs-update` archives it).

### 1. Root scripts (unblocks everything)
- New root `package.json`: `name lexiquest, private, engines.node >=20`, **no** `type: module`, scripts:
  `install:all` → `npm --prefix api ci --no-audit --no-fund && npm --prefix frontend ci --no-audit --no-fund`;
  `test:api` → `npm --prefix api test`; `test:frontend` → `npm --prefix frontend test`;
  `test` → `npm run test:api && npm run test:frontend`; `typecheck` → `npm --prefix api run typecheck`;
  `lint` → `npm --prefix frontend run lint`; `build` → `npm --prefix api run build && npm --prefix frontend run build`;
  `validate:specs` → `node scripts/validate-specs.js`.
  Root `package-lock.json` generated by `npm install` (trivial). Sub-lockfiles untouched.
- Single-file runs in operator mode: `npm run test:api -- --coverage.enabled=false src/<file>.test.ts`
  (matches the allowlist entry; disables per-file thresholds that a partial run would fail).
- Update install/test instructions in `README.md`, `docs/setup.md`, `docs/getting-started.md` to the root
  scripts (the `cd api && …` forms stay valid for humans; mention both).
- Verify: `npm run install:all && npm run typecheck && npm run lint && npm test && npm run build`.

### 2. CI
- New `.github/workflows/ci.yml`, `name: CI`, `on: pull_request` + `push: main`,
  `permissions: contents: read`, `concurrency` per ref, Node 20 with npm cache keyed on both
  sub-lockfiles, steps: `npm run install:all`, `typecheck`, `lint`, `test:api`, `test:frontend`, `build`.
  No label steps.
- `.github/workflows/azure-static-web-apps.yml`: drop the `pull_request` trigger and the
  `close_pull_request_job`; keep push-to-main deploy as is.

### 3. Spec validator + meta-test (TDD: RED first)
- `scripts/validate-specs.js` — dependency-free CommonJS, exports `parseSpecHead`/`specHeadProblems`
  and runs as CLI (`node scripts/validate-specs.js [paths…]`, default = all of `docs/specs/*.md`, skips
  `README.md`): `---` on line 1; `issue` digits equal to the basename prefix; `status` first word in
  `draft|approved|in-progress|implemented|failed`; body `Status:` in step (draft↔proposed,
  implemented↔implemented); exactly one `# ` title; the required `## N.` headings present. Exit 1 with
  `path: problem` lines.
- `api/src/__meta__/specs-frontmatter.test.ts` — loads the validator via `createRequire` (api compiles
  CJS; `__dirname` already used in `auth-boundary.test.ts`), ports BCObservatory tests 1–7 (parse, no
  frontmatter, each problem, approved/in-progress/failed leave the body alone, required-only, every
  committed spec valid, every PROGRESS "Open specs" entry valid). Runs inside `npm run test:api`
  (`__meta__` in the vitest include, excluded from coverage).

### 4. Spec convention
- Rewrite `docs/specs/README.md` (no frontmatter!): lifecycle (issue → `/lexiquest-spec` or League
  `/sdd-draft` → owner applies `spec-approved` → League `/sdd-build` on `league/<issue>-<slug>`,
  draft PR `league-building` → `/sdd-review` → squash-merge → push-to-main deploy → `status: implemented`),
  file naming, frontmatter contract, the 12 sections adapted to LexiQuest (1 Goal with `file:line`
  evidence at a named sha; 2 Behaviour after: screens/API/i18n keys NL+EN; 3 Decisions + rejected;
  4 Contract: endpoints, table rows/row keys, seams, UI; 5 Test plan = RED list with AC→test file/name
  traceability + seams + edge cases; 6 Tasks as TDD slices; 7 Verification = root commands,
  `/local-smoke` as operator step when the boot path changes; 8 Later; 9 Risks + the default the
  coder takes; 10 Files; 11 Definition of Done incl. changelog/PROGRESS/user-guide, invariants 1–4;
  12 Proposed edits to other files), ship-time "12. Built, deviations" insertion, what the League
  cannot do (deps, skills, workflows, secrets, deploy, `.league.json`), the template as a fenced block
  (never a numbered template file).
- `docs/plans/README.md`: naming `<issue>-<slug>.md` for spec-driven plans + the `## Blast radius`
  section (`Rating: <one word>` on its first line, legend lives in `sdd-build`).
- `docs/tdd/methodology.md`: short §11 "Spec-driven slices" (spec §5 = RED list, §6 = slices; the
  `spec-approved` label covers the PLAN gate for safe/low-risk in operator mode).

### 5. Skills (frontmatter `name` + `description` only; no inline shell)
- **New `.claude/skills/lexiquest-spec/SKILL.md`** — human spec writing, `bcobs-spec` adapted:
  worktree `spec/<slug>` from `origin/main`; read Design.md section, PROGRESS, neighbouring specs; one
  `AskUserQuestion` round (≤4, cheapest option first); verify every claim at a named sha; `gh issue
  create` **first** (the number is in the file name); write `docs/specs/<n>-<slug>.md` as `status: draft`;
  `npm run validate:specs`; add the PROGRESS "Open specs" line; commit `docs: spec for <title> (#<n>)`
  + push; never approve, never label. Hand-off text: build by hand with `/sdd-build …` or apply
  `spec-approved` on issue #n. Operator mode = whatever `sdd-draft` says.
- **Rewrite `.claude/skills/sdd-draft/SKILL.md`** — `/sdd-draft <issue>`: mode check; issue text from
  `.league/issue-<n>.md` (operator) or `gh issue view` (manual); slug from title; collision →
  `needs-answer`; vague issue → `NEEDS-ANSWER`; writes ONLY the spec, questions → §9 defaults; runs
  `node scripts/validate-specs.js <path>`; no commit in operator mode; `{outcome, spec_path}` JSON.
- **Rewrite `.claude/skills/sdd-build/SKILL.md`** — `/sdd-build docs/specs/<n>-<slug>.md`:
  §0 mode; manual claim check (`gh issue view --json labels`, `gh pr list --label league-building`,
  `git branch -r --list 'origin/league/<n>-*'`, `git worktree list`) and worktree `build/<slug>`;
  §1 plan `docs/plans/<n>-<slug>.md` in the tdd-cycle format + `## Blast radius` with `Rating: <word>`
  first; legend in the skill: safe = docs, tests, i18n strings; low-risk = screens/components/charts,
  api handlers, non-auth `shared/*`, with tests; risky = `api/src/shared/auth.ts`, `session-signer.ts`,
  `session-cookie.ts`, `password-hasher.ts`, `bcrypt-password-hasher.ts`, `claude.ts`,
  `connection-string-guard.ts`, row-key/partition code, `api/src/index.ts` composition root,
  `Design.md`, `staticwebapp.config.json`; breaking = removed/renamed route, changed table shape or
  row-key format, `.league.json`, `api/scripts/**`. risky/breaking → `plan-waiting`.
  §2–§5 = `/tdd-cycle` Steps 1–12 with the human gate replaced by the spec approval; commands = the
  root scripts only (RED via `npm run test:api -- --coverage.enabled=false <file>`, COVER via
  `npm run test:api` / `test:frontend`); security scan in operator mode = the Grep tool + the
  `__meta__` tests (no `npm audit`, no Bash grep); `/docs-update` without `git mv` (plan archiving is
  an operator step); §6 ship-time edits (spec `status: implemented` + body line + "12. Built,
  deviations"; PROGRESS: Open-specs entry removed, ✅ "Post-v1 — <title>" line; changelog bullet);
  §7 ambiguity → `needs-answer`; §8 git: stage by name, never commit/push in operator mode (the
  League checkpoints), manual: show diff, ask before push; JSON report.
- **New `.claude/skills/sdd-review/SKILL.md`** — `$TMPDIR` worktree on the PR branch, `npm run
  install:all`, the root commands, `/local-smoke`, `git diff --stat origin/main..` restricted to the
  spec's §10 files; checklist (only the spec's files; red was real; AC→test traceability; coverage
  tiers; changelog + PROGRESS edited; `status: implemented`; invariants/meta-tests; no secrets); ranked
  findings; fixes on the PR branch when asked; `git mv` the plan to `done/`; update `## League state`.
- **Edit `.claude/skills/tdd-cycle/SKILL.md`** Steps 0.5/4/6/9: mention root scripts and the
  spec-driven plan name; **`security-scan`** and **`docs-update`**: one operator-mode note each.

### 6. Repo config and docs
- `.league.json`:
  `commands: ["npm run test:api","npm run test:frontend","npm run typecheck","npm run lint","node scripts/validate-specs.js"]`,
  `pre_build: ["npm ci --prefix api --no-audit --no-fund","npm ci --prefix frontend --no-audit --no-fund"]`,
  `ci_required: ["CI"]`, `protected` per decision 5. Validate with Jarvis's parser (see Verification).
- `CLAUDE.md`: new "Spec Driven Development (issue → spec → build)" section above the operator
  block (flow, four skills, approval = label, branch names, what the League may/may not touch, root
  scripts); add the skills to "Repo-local skills". Operator block untouched (Jarvis checks its markers).
- `PROGRESS.md`: `## Open specs` after "Status summary" + this slice ✅; `docs/README.md`: `specs/`;
  `README.md`: status/doc-map line; `.github/copilot-instructions.md`: pointer.
- `.claude/settings.json`: allow `gh issue:*`, `gh pr list:*`, `gh pr view:*`, `gh pr checks:*`,
  `gh label list:*`, `git fetch:*`, `git worktree:*`, `git switch:*`, `node scripts/validate-specs.js:*`.
- `.gitignore`: `.league/` (hand dry-runs).
- Labels, one-off: `gh label create needs-spec`, `spec-approved`, `league-building` (League tolerates
  pre-existing ones; needed so the owner can approve from the GitHub UI/phone).

### 7. Close the cycle
- `/security-scan`, `/docs-update` (changelog, PROGRESS, setup, getting-started, index; archives the
  plan), commits per step on `sdd/league-setup`, `.league.json` last; push; PR
  "chore: Spec Driven Development + GitHub League wiring"; `CI` green; merge.
- After merge (operator, Jarvis side): HUD → Repos → LexiQuest → **Re-probe** (`workflows` shows `CI`
  active; `manifest` re-pinned) → **Activate**. Then open a small test issue and let the League draft.

## Files

New: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `scripts/validate-specs.js`,
`api/src/__meta__/specs-frontmatter.test.ts`, `.claude/skills/lexiquest-spec/SKILL.md`,
`.claude/skills/sdd-review/SKILL.md`, `docs/plans/post-v1-sdd-league.md`.
Replaced: `.claude/skills/sdd-draft/SKILL.md`, `.claude/skills/sdd-build/SKILL.md`, `docs/specs/README.md`.
Modified: `.league.json`, `.github/workflows/azure-static-web-apps.yml`, `CLAUDE.md`, `PROGRESS.md`,
`README.md`, `docs/README.md`, `docs/plans/README.md`, `docs/tdd/methodology.md`, `docs/setup.md`,
`docs/getting-started.md`, `docs/changelog.md`, `.github/copilot-instructions.md`, `.claude/settings.json`,
`.gitignore`, `.claude/skills/tdd-cycle/SKILL.md`, `.claude/skills/security-scan/SKILL.md`,
`.claude/skills/docs-update/SKILL.md`. Untouched: `api/package.json`, `frontend/package.json`, both sub-lockfiles.

## Verification

1. Root: `npm run install:all && npm run typecheck && npm run lint && npm test && npm run build` green
   (≈944 api + ≈650 frontend); `npm run test:api -- --coverage.enabled=false src/shared/sm2.test.ts` runs one file.
2. Meta-test RED before `scripts/validate-specs.js` exists, GREEN after; `node scripts/validate-specs.js` exits 0.
3. `/local-smoke` PASS (nothing in `api/`/`frontend/` changed, but prove it).
4. Manifest + allowlist, with Jarvis's own code from `/Users/waldo/SourceCode/Community/waldo.Jarvis`:
   `npx tsx -e "import {parseLeagueManifest} from './services/league-repos/src/manifest.ts'; import {readFileSync} from 'node:fs'; console.log(parseLeagueManifest(readFileSync('/Users/waldo/SourceCode/Community/LexiQuest/.league.json','utf8')))"`
   → `ok: true`; same with `makeLeagueCanUseTool` from `services/league/src/permissions.ts`:
   `npm run test:api -- --coverage.enabled=false src/x.test.ts` → allow, `cd api && npx vitest` → deny.
5. Skill vetting: frontmatter lines of every `.claude/skills/*/SKILL.md` contain only `name:`/`description:`; no `` !` `` anywhere.
6. Hand dry-run, no Jarvis: `git worktree add /tmp/lq-draft -b league/draft-<n>-spec origin/main`,
   write `.league/issue-<n>.md`, `JARVIS_OPERATOR=1 claude --permission-mode acceptEdits -p "/sdd-draft <n>"`
   → only `docs/specs/<n>-*.md` changed, `status: draft`, no commit, JSON block. Then
   `/sdd-build docs/specs/<n>-*.md` in a `league/<n>-<slug>` worktree up to the plan + rating
   (`Rating:` line parses), no commits, nothing under `.github/`/`.claude/`/lockfiles. Discard both.
7. PR: `CI` green on the head sha; SWA workflow does not run on the PR; merge; the push deploy goes
   green (`/deploy-swa`); Jarvis Re-probe all green; Activate.
