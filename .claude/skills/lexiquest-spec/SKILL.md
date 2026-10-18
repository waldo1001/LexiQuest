---
name: lexiquest-spec
description: Write a feature spec for LexiQuest that a coding session (human + Claude, or waldo.Jarvis's GitHub League) can build without asking. Use when the owner asks to spec, design, write up or plan a feature, a fix or a change ("spec this", "write a spec for", "maak een spec", "the end goal is a spec"), or to revise a draft in docs/specs/. Creates the GitHub issue first, writes docs/specs/<issue>-<slug>.md as status draft, registers it in PROGRESS.md, pushes. Never approves a spec. Also the flow /sdd-draft runs in League operator mode (no questions, no gh, no push).
---

# Writing a spec for LexiQuest

Read [docs/specs/README.md](../../../docs/specs/README.md) first: it owns the lifecycle, the file
name, the frontmatter and the twelve sections. This skill is the procedure around it.

A spec has two possible builders: a human session (`/sdd-build docs/specs/<issue>-<slug>.md`) or
the League. The League's go signal is the `spec-approved` label on the issue, applied only by the
owner. **A spec you write is always `status: draft`, even when the owner says "go ahead".**

**Which mode am I in?** Run `echo "${JARVIS_OPERATOR:-0}"`. `1` = operator mode: the League handed
this session a checkout, a branch and an issue (`/sdd-draft`); it holds git; there is no network
credential. Anything else = a manual session.

## 1. Where to work

- Operator mode: the checkout and branch you were given. No worktree.
- Manual session: a worktree no coding session uses. `git worktree list`; when in doubt
  `git worktree add -b spec/<slug> ../LexiQuest-spec-<slug> origin/main`. Never reset, check out
  over, or pull into a worktree holding another session's uncommitted files.
- Read before writing: [Design.md](../../../Design.md) (the section the change touches; §7 for
  deferred v2 items), [PROGRESS.md](../../../PROGRESS.md), the specs in `docs/specs/` and plans in
  `docs/plans/done/` that touch the same screens or endpoints, and
  [docs/tdd/testability-patterns.md §6](../../../docs/tdd/testability-patterns.md) (the four invariants).

## 2. A spec session changes nothing else

No code edits outside `docs/`, no installs, no deploys, no `/dev-start`. Reading the tree, running the
existing tests, `gh` reads and a local `swa start` probe to measure today's behaviour are fine.
"Add a dependency" in the request describes the spec's scope: the spec writes the install as an
operator step (the League cannot touch `api/package.json` or `frontend/package.json`).

## 3. One scoping round, then write

Manual session: one `AskUserQuestion` round, at most four questions, only for what genuinely changes
the work (which screens, which roles, whether a Design.md amendment is in, whether an adjacent small
fix rides along). Cheapest option first, recommended. Do not ask what the repository answers.

Operator mode: nobody to ask. Take the cheapest option for each question you would have asked and
write every one into section 9 with the default the coder takes. When the issue is too vague to say
what to build at all, write no spec and end `NEEDS-ANSWER: <one concrete question>`.

## 4. Verify, then claim

- Every claim about the code cites `file:line` at a named commit; write "verified against the tree at
  `<short sha>` on <date>" in the scope paragraph.
- Every number is measured: test counts from `npm run test:api` / `npm run test:frontend`, coverage
  from the same run, row counts from the seed or a probe. Name the command.
- A spec that depends on another spec reads that spec's "12. Built, deviations", not its plan.
- Behaviour claims about the running app come from the code path (handler → shared → seam), not
  from memory; where a screen is involved, name the component file and the i18n key.
- The four invariants are constraints, never trade-offs: `userId` from the session only, stats
  aggregates only, AI import through Import Review, hashes and tokens never leave their boundary.

## 5. The issue, then the file

Manual session: revising a spec reuses its `issue:`. Otherwise
`gh issue list --state all --search "<title>"` for an existing issue, else create it **before**
writing the file (the number is in the file name):

```bash
gh issue create --title "<spec title>" --body "<one paragraph: the problem and the change>"
```

No `--label`. Take the number from the printed URL. Operator mode: `issue:` is the number `/sdd-draft`
was given; no `gh`.

Then `docs/specs/<issue>-<slug>.md` per the README: frontmatter, title, `Status: proposed, <date>`,
sections 1–12. Section 5 is a full RED list in the `/tdd-cycle` Step 3 format; section 6 cuts the
work into slices a `/tdd-cycle` can run one at a time; section 7 names the root commands; section 12
holds the changelog bullet, the PROGRESS line and the user-guide paragraph ready to paste.

Check it: `npm run validate:specs` (or `node scripts/validate-specs.js docs/specs/<issue>-<slug>.md`).

## 6. Register it (manual session only)

[PROGRESS.md](../../../PROGRESS.md) section `## Open specs`: one line
`- ⬜ [<title>](docs/specs/<issue>-<slug>.md) — issue #<issue>, proposed <date>`.
A League draft cannot edit PROGRESS.md; the owner adds the line when approving, or `/sdd-build`
adds the shipped line at the end.

## 7. Commit and push

Operator mode: do **not** commit, do not push (the League commits the spec and opens the PR). End
with the report `/sdd-draft` describes.

Manual session, stage by name:

```bash
git add docs/specs/<issue>-<slug>.md PROGRESS.md
git commit -m "docs: spec for <title> (#<issue>)"
if git pull --rebase origin main; then git push origin HEAD:main; else echo "rebase conflict: resolve, do not push"; fi
```

A push to `main` deploys (push-to-main → Azure SWA). A docs-only push rebuilds and redeploys the
same code; that is fine, but do not push while a `/deploy-swa` of someone else's change is mid-run
(`gh run list --workflow "Azure Static Web Apps CI/CD" --limit 1`).

## 8. Hand-off

Manual session, to the owner: the spec path, the issue number (and that you created it), the slices
and what each costs, the open questions with their defaults, and the two ways on: "build it by hand
with `/sdd-build docs/specs/<issue>-<slug>.md`, or apply the `spec-approved` label to issue #<issue>
to hand it to the League (it stays `draft` until you do)".
