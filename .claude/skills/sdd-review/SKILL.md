---
name: sdd-review
description: Review a pull request that builds a LexiQuest spec (a League PR on league/<issue>-<slug>, or a manual build branch) the way the owner reviews one - verify, never trust, against the spec's test plan, Definition of Done and the four invariants, then rank findings and apply fixes on the PR branch when asked. Use for "review PR N", "review the League's PR", "what did the coding agent get wrong".
---

# Reviewing a spec build

The PR body and the spec's "12. Built, deviations" are claims. The review runs the checks itself
and reports what it ran, with the totals; a check not run is not a pass. The main checkout is never
touched (other sessions keep uncommitted files there).

## 1. Read

`CLAUDE.md`; the spec whole, sections 12 (built, deviations), 11 (Definition of Done) and 5 (test
plan) with care; the issue; the PR body's `## League state`; the plan `docs/plans/<issue>-<slug>.md`
and its `Rating:`. Note every allowance the spec makes ("Y if X is impossible") and every operator
step the builder could not run.

## 2. Set up

A worktree on the PR branch under `$TMPDIR` with its own install:

```bash
gh pr view <N> --json headRefName,headRefOid --jq '.headRefName + " " + .headRefOid'
git fetch -q origin
git worktree add "$TMPDIR/lexiquest-review-<N>" origin/<branch>
cd "$TMPDIR/lexiquest-review-<N>" && npm run install:all
```

## 3. Verify

- `npm run test:api` and `npm run test:frontend`: totals and the per-file coverage lines for every
  touched file (Tier A 90% for `api/src/**` and `frontend/src/lib/**`, Tier B 70% for screens,
  components, charts).
- `npm run build` (both projects — the deploy path); `npm run validate:specs`.
- The spec's section 7 commands, including the operator steps the League could not run:
  [`/local-smoke`](../local-smoke/SKILL.md) when the boot path, a route or
  `staticwebapp.config.json` changed; a `/dev-start` probe of the screen when the change is visual.
- The PR's CI status on the **final** head sha (`gh pr checks <N>`).
- `git diff --stat origin/main..HEAD`: every file is one the spec's section 10 names or section 12
  explains.

## 4. Checklist

Each line is a finding when it fails; the first five are blocking.

- [ ] **Only the spec's files.** No probe tests, dumps, or "safe to delete" leftovers; nothing under
      `.github/`, `.claude/`, lockfiles, `api/package.json`, `frontend/package.json`.
- [ ] **Red was real.** The report's `red_evidence` names a failing test before the change, for the
      stated reason; the AC → test table covers every AC of spec §5 with a test that exists.
- [ ] **The four invariants.** `src/__meta__` tests pass; no `userId` from a body; stats return
      aggregates only; import never persists; no hash or token in a response, log, fixture or snapshot
      (run [`/security-scan`](../security-scan/SKILL.md)).
- [ ] **Coverage tiers hold** on every touched file; a new exclusion in a vitest config is justified in
      section 12 or it is a finding.
- [ ] **Tests and CI green on the final head**, and the PR body's "last test run" line is from that head.
- [ ] **Allowances were earned.** For each "Y if X is impossible" the builder took Y on, section 12
      records the attempt at X and why it failed.
- [ ] **Contract kept.** Routes, row keys, cookie shape, i18n keys the spec names as unchanged are
      unchanged; NL and EN strings both added.
- [ ] **Ship-time edits complete.** Frontmatter `status: implemented` with the body line in step,
      section 12 present and the old 12 renumbered to 13, changelog bullet, PROGRESS line, user-guide
      paragraph when family-visible, every open operator step listed.
- [ ] **Blast radius honest.** The plan's `Rating:` matches the files actually touched per the
      `sdd-build` table; a `risky` change that was rated `low-risk` is a finding against the builder.

## 5. Report

Ranked: must fix before merge, should fix, would have done the same. Each finding names the file and
line, what is wrong, and what caused it (the builder, the spec, or stale reporting), so the owner can
feed it back. A table of what was verified with the totals. Say whether to squash (League commits are
`checkpoint(league): …`; the PR title carries the conventional prefix) and what the owner still runs
after merge (`/deploy-swa` probes, a dependency install, a Design.md amendment).

## 6. Fixes, when asked

On the PR branch in the review worktree: stage by name, one commit
`fix(<scope>): review of PR #<N>: …` with the session's attribution, `npm run test:api && npm run
test:frontend` green first, push to the PR branch, update the PR body's `## League state` (phase,
head, last test run, next step) and the spec's section 12. Before merging, on the PR branch:
`git mv docs/plans/<issue>-<slug>.md docs/plans/done/` with links rewritten (the League cannot move
files) — never as a commit after the merge.
Remove the worktree; leave the main checkout as it was.
