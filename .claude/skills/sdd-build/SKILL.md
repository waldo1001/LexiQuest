---
name: sdd-build
description: Build one spec from docs/specs/ by path, tests first, through this repository's TDD cycle, and do the ship-time edits (spec status implemented + "Built, deviations", changelog, PROGRESS). Use for "/sdd-build docs/specs/<issue>-<slug>.md", "build the open spec", "pick up the spec". One flow, two modes - waldo.Jarvis's League (entry point `build` in .league.json, operator mode) and a manual session.
---

# Building a spec

`/sdd-build docs/specs/<issue>-<slug>.md` builds one spec. The spec is the contract: its section 5 is
the RED list, section 6 the slices, section 11 the Definition of Done. When it is unclear you ask or
stop (section 7 below); you never guess. Read `CLAUDE.md`, the spec whole, and
[docs/specs/README.md](../../../docs/specs/README.md) first.

## 0. Mode, and may I start

```bash
echo "${JARVIS_OPERATOR:-0}"
```

`1` = **operator mode**: the League gave you a worktree on branch `league/<issue>-<slug>`, an
unprivileged user and no network credential. It holds git: you **never commit, never push, never open
or merge a PR, never touch the default branch** (the League writes checkpoint commits of your work).
Bash is limited to the root scripts in `.league.json`:

```
npm run test:api                           full api suite with coverage (Tier A thresholds)
npm run test:frontend                      full frontend suite with coverage (Tier A/B thresholds)
npm run test:file:api -- <file>            one api test file, no coverage (the RED/GREEN loop)
npm run test:file:frontend -- <file>       one frontend test file, no coverage
node scripts/validate-specs.js [<spec>]    the spec contract
```

No `cd`, no `npx`, no `git`, no `grep`/`rm`/`mv` in Bash: read with Read/Grep/Glob, write with
Write/Edit. Anything else = a **manual session**.

Read the spec's frontmatter (`issue:`, `status:` first word).

- **Operator mode**: approval happened upstream (the `spec-approved` label on the issue), so `status:`
  may read `draft` or `approved`; do not wait for it to change and do not edit it until the end.
  `implemented` → end `needs-answer: spec already implemented`.
- **Manual session**: read-only claim check first, then build only if nothing claims it:
  ```bash
  git fetch -q origin
  gh issue view <issue> --json labels --jq '.labels[].name'      # spec-approved → the League owns it
  gh pr list --label league-building --state open --json number,headRefName
  git branch -r --list 'origin/league/<issue>-*'
  git worktree list
  ```
  A `spec-approved` label, a `league-building` PR or a `league/<issue>-*` branch means the League is
  building or about to: stop and tell the owner; never start a second build. To take over, follow
  `CLAUDE.md` § Taking over from the League. Tell the owner not to apply `spec-approved` to an issue
  you are building by hand.

## 1. Set up and plan (= `/tdd-cycle` Step 0.5, with the blast radius)

- Manual session: a worktree from `origin/main`
  (`git worktree add -b build/<slug> ../LexiQuest-build-<slug> origin/main`), then `npm run install:all`.
- Operator mode: stay in the worktree and branch you were given; dependencies are installed.

Write the plan file `docs/plans/<issue>-<slug>.md` in the
[`/tdd-cycle`](../tdd-cycle/SKILL.md) Step 0.5 format (Task, Scope IN/OUT, Files, Seams, RED list
copied from spec §5, Open questions, Risks, Follow-ups) plus:

```
## Blast radius

Rating: <safe | low-risk | risky | breaking>
<why, in one or two lines — no second rating word on the Rating line>
```

The rating is the highest row any task touches:

| Rating | What the spec touches |
|---|---|
| `safe` | docs, tests, fakes under `api/testing/` or `frontend/src/testing/`, i18n strings; no behaviour change |
| `low-risk` | `frontend/src/screens|components|charts|lib`, `api/src/functions/*` handlers, non-auth `api/src/shared/*` — each with tests, inside the existing contracts |
| `risky` | `api/src/shared/auth.ts`, `session-signer.ts`, `session-cookie.ts`, `password-hasher.ts`, `bcrypt-password-hasher.ts`, `claude.ts`, `connection-string-guard.ts`, `azure-table-storage.ts`, `api/src/index.ts` (composition root), `frontend/src/context/AppContext.jsx`, `frontend/src/lib/api.js`, a new table or a new field on an existing row, `Design.md`, `staticwebapp.config.json`, anything under `.github/` or `.claude/` |
| `breaking` | a removed or renamed route or query parameter, a changed partition/row-key format or a migration of stored rows, a changed session-cookie shape, `.league.json`, `api/scripts/**`, a dependency change |

`safe` and `low-risk`: the spec's approval covers the plan — continue (manual session: show the
plan and get the owner's "go" as `/tdd-cycle` requires). `risky` and `breaking`: write the plan and
end `plan-waiting` **before editing any code** (manual session: ask the owner). Protected paths
(`api/package.json`, `frontend/package.json`, lockfiles, `staticwebapp.config.json`, `api/host.json`,
`api/scripts/**`, `.github/**`, `.claude/**`, `.league.json`) are never edited by the League: such
tasks become operator steps in "Built, deviations".

## 2. RED first (= `/tdd-cycle` Steps 1–5)

Post the FRAME (≤150 words) and the task sentence. Section 5 of the spec is the RED list; write
those tests first, one at a time, and run only that file:

```
npm run test:file:api -- src/functions/<x>.test.ts
npm run test:file:frontend -- src/screens/<X>.test.jsx
```

A failure about plumbing (`Cannot find module`, `is not a function`) → scaffold the seam
(`/tdd-cycle` Step 5) and re-run; a failure about behaviour is a true RED. Keep the failing test
names and messages as your `red_evidence`. A test that passes before the change proves nothing:
fix the test. A docs-only spec has no test to write: say so, do not invent one.

## 3. GREEN, REFACTOR, COVER (= `/tdd-cycle` Steps 6–9), in the spec's order

Do section 6 (Tasks) slice by slice. Rules, both modes:

- Smallest implementation that turns the one test green, then the next RED. Refactor under green.
- The four invariants hold: `userId` from `requireAuth(req).userId` only; stats endpoints return
  aggregates only; `POST /api/cards/import` never persists; hashes and session tokens never in
  responses, logs, errors, fixtures or snapshots.
- Seams, never real I/O in tests: tables | claude | clock | hasher | signer | random | logger | tts |
  fetch (fakes in `api/testing/`, `frontend/src/testing/`).
- COVER: `npm run test:api` and `npm run test:frontend` enforce Tier A (90%) and Tier B (70%) per
  file. Below threshold → more tests, or a justified exclusion in the vitest config (that is a
  deviation; record it). Write the AC → test traceability table.
- A change that does not match the spec is a deviation: record it (section 5 below), never hide it.
- **"Do X, or Y if X is impossible" means attempt X first** and record in "Built, deviations" what
  failed and how. A fallback taken without the attempt is a deviation the spec did not allow.
- Diagnostics live in `$TMPDIR` only, never under `api/`, `frontend/` or `docs/`.
- i18n: every new string has an NL and an EN key (`frontend/src/i18n/strings.js`); the
  `strings.js` test keeps the two in step.

## 4. SECURITY SCAN and UPDATE DOCS (= `/tdd-cycle` Steps 10–11)

- **Security scan**: run [`/security-scan`](../security-scan/SKILL.md). In operator mode its shell
  steps are replaced by the Grep tool over the diffed files (secrets, `$2[aby]$` bcrypt shapes,
  `sk-ant-`, connection strings, `password_hash` in responses/logs) and by
  `npm run test:file:api -- src/__meta__` (the invariant meta-tests); `npm audit` is an operator step.
  A finding blocks: outcome `failed`, status stays.
- **Docs**: run [`/docs-update`](../docs-update/SKILL.md): the `docs/changelog.md` bullet (always),
  `docs/user-guide.md` when family-visible, `docs/setup.md` / `getting-started.md` when setup
  changed. The plan file stays in `docs/plans/` in operator mode (`/sdd-review` archives it at merge).

## 5. Ship-time edits (the spec's section 12, applied)

Only when every test and check passes, in the same branch:

- **The spec**: insert `## 12. Built, deviations (<date>)` before the old section 12, which becomes
  `## 13. Proposed edits to other files (applied <date>, see section 12)`. Section 12 says what was
  built, what was verified (commands and totals), the AC → test table, every deviation or "none",
  and the operator steps still open (dependency installs, `/local-smoke`, Design.md amendments).
  Tick the Definition of Done; an unticked item is a deviation.
- **`PROGRESS.md`**: remove the spec's line from `## Open specs` (write `None open.` when it was
  the last); append a `## Post-v1 — <title>` section at the end in the existing format, with
  `Spec: [docs/specs/<issue>-<slug>.md](docs/specs/<issue>-<slug>.md) (#<issue>)`, the ✅ slices
  and the test totals.
- **Status**: frontmatter `status: implemented`; body line `Status: implemented, <date> (section 12
  records what was built and where it differs). Owner: waldo.` Keep `issue:`. Only for outcome
  `built`; for `plan-waiting`, `needs-answer` and `failed` the status stays.
- `node scripts/validate-specs.js docs/specs/<issue>-<slug>.md` must pass (the meta-test runs it too).

## 6. Verify

`npm run test:api` and `npm run test:frontend` on the final tree (totals into the report), then every
command of the spec's section 7 that is on the allowlist; the rest are operator steps, named as such.
A check you skipped is a skipped check, not a pass. Failing tests you cannot fix: outcome `failed`,
status stays, no ship-time edits.

## 7. Ambiguity

- Operator mode: one concrete question, outcome `needs-answer`; finished slices stay, nothing
  half-done.
- Manual session: `AskUserQuestion`, one decision per question, your recommendation first. A hard
  stop (a failing check you cannot fix) is reported, not asked about.
- A spec claim that no longer matches the tree (a moved file, a shifted line) is not ambiguity:
  re-verify, build what the spec means, list the correction under "Built, deviations". A
  contradiction that changes behaviour is ambiguity.

## 8. Git and outcome

Operator mode: do not commit, do not push, do not `git add`; end with the report the League asked for:

```json
{
  "outcome": "built" | "plan-waiting" | "needs-answer" | "failed",
  "plan_path": "docs/plans/<issue>-<slug>.md",
  "blast_radius": "safe" | "low-risk" | "risky" | "breaking",
  "question": "<only for needs-answer>",
  "tests": { "command": "npm run test:api && npm run test:frontend", "passed": <n>, "failed": <n> },
  "red_evidence": "<the failure you saw before the code existed>",
  "files": ["<every file you changed>"],
  "notes": "<operator steps, deviations, anything the owner should know>"
}
```

Manual session: stage by name (never `git add -A`), one commit per slice
(`feat(<scope>): <title> (#<issue>)`, body names the spec), show the owner the diff summary, run
[`/local-smoke`](../local-smoke/SKILL.md) when the boot path changed, and ask before pushing
(push to `main` deploys). Before the PR merges, on the build branch: `git mv
docs/plans/<issue>-<slug>.md docs/plans/done/` with the links rewritten — the changelog, PROGRESS and
the spec's section 12 are already in the branch (§5). Then remove the worktree and tell the owner
what [`/deploy-swa`](../deploy-swa/SKILL.md) should probe. Operator steps that finish after the
merge (a live probe, a workflow's first run) are recorded as a comment on the merged PR; the spec's
section 12 catches up in the next PR that touches the spec. Never push a docs-only commit to `main`
to record them.
