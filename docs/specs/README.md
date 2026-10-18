# Specs — LexiQuest

One markdown file per unit of work, written **before** the code, precise enough that a coding
session (a human with Claude, or waldo.Jarvis's GitHub League) builds it without asking. The spec
is the contract; `/tdd-cycle` turns its test plan into RED tests. This file has no frontmatter on
purpose: the League reads every `docs/specs/*.md` and treats a file with `issue: <number>` as a
spec — and its parser accepts a `---` block on **any** line, so every example in this file keeps
`issue: <N>` as a placeholder, never a real number.

## Lifecycle

```
GitHub issue ──► docs/specs/<issue>-<slug>.md  status: draft
                 (by /lexiquest-spec, or the League's /sdd-draft from the issue)
      │
      ▼  the owner applies the `spec-approved` label on the issue (GitHub UI, phone, Jarvis HUD)
      │  — never by editing the frontmatter, never by the spec writer
      ▼
League builds on branch league/<issue>-<slug>, draft PR labelled `league-building`
(or a human runs /sdd-build docs/specs/<issue>-<slug>.md in a build/<slug> worktree)
      │
      ▼  /sdd-review verifies the PR (tests, coverage tiers, invariants, ship-time edits)
      ▼  squash-merge ──► push-to-main deploys to Azure SWA (/deploy-swa watches it)
      │
      ▼  status: implemented, section "12. Built, deviations" records what really shipped
```

- **Draft**: `status: draft`, body line `Status: proposed, <date>`. Nothing is built from a draft.
- **Approved**: the label on the issue is the only approval. `status: approved` in the file is
  advisory; the flip to `implemented` rides in the build PR.
- **Implemented**: `status: implemented`, body line `Status: implemented, <date> (section 12 …)`.
- **Failed**: a build that could not be finished; the PR body's `## League state` says why.
- Taking a League build over by hand: see `CLAUDE.md` § Taking over from the League.

## File name and frontmatter

`docs/specs/<issue>-<slug>.md` — the GitHub issue number, a dash, a kebab-case slug of the title.
The League refuses a draft whose name does not start with the issue number, so the issue exists
before the spec: `/lexiquest-spec` creates it first.

```
---
issue: <N>
status: draft
---

# <Title: what changes, in the learner's or parent's words>

Status: proposed, 2026-10-18. Owner: waldo.
Scope: <what it touches>. Every claim below was verified against the tree at `<sha>` on <date>.
Not in scope: <…>.
```

`node scripts/validate-specs.js` (also `npm run validate:specs`, and the meta-test
`api/src/__meta__/specs-frontmatter.test.ts` in every `npm run test:api`) checks: `---` on line 1,
`issue` a number equal to the file-name prefix, `status` in `draft | approved | in-progress |
implemented | failed`, the body `Status:` line in step, exactly one `# ` title, sections 1–12 present.

## The twelve sections

Keep the numbers and the order; a reader (and `/sdd-build`) navigates by them.

1. **Goal** — the problem with evidence: `file:line` at the named sha, test counts, measured
   behaviour (what the learner sees today). Then "After this change:" bullets.
2. **Behaviour after** — screens, API responses, i18n keys (NL **and** EN strings), audio, PWA. Exact
   wording where it matters; which role sees what (Design.md §2).
3. **Decisions** — what was chosen and what was rejected, with the reason for each. Cite the
   Design.md section the change extends or amends.
4. **Contract** — endpoints (route, method, request/response shape, status codes), Table Storage rows
   (partition key, row key, fields — see `docs/tdd/ai-maintainability.md` on row-key format), seams
   touched (tables | claude | clock | hasher | signer | random | logger | tts | fetch), UI components
   and props. One example record.
5. **Test plan (write first)** — the RED list in the `/tdd-cycle` Step 3 format: per acceptance
   criterion the test file, the test name, seams, edge cases. This is what the builder writes first;
   it must be complete enough that every AC maps to a named test.
6. **Tasks** — ordered TDD slices that can ship alone (one slice = one plan file, one commit).
7. **Verification** — the exact commands: `npm run test:api`, `npm run test:frontend`, the coverage
   tiers to confirm, `/local-smoke` when the boot path or `staticwebapp.config.json` changes
   (an operator step for the League), what to probe after deploy.
8. **Later, not in this spec.**
9. **Risks and open questions** — each with the default the coder takes when nobody answers.
10. **Files** — new and changed, under `api/` and `frontend/`; fakes under `api/testing/` or
    `frontend/src/testing/`.
11. **Definition of Done** — checkable boxes, always including: tests named per AC; Tier A/B coverage
    on touched files; the four invariants (`CLAUDE.md` § Project-specific invariants) still hold;
    `/security-scan` pass; `docs/changelog.md` bullet; `docs/user-guide.md` when family-visible;
    `PROGRESS.md` line; spec `status: implemented`.
12. **Proposed edits to other files (not applied)** — the changelog bullet, the PROGRESS line, the
    user-guide paragraph, any Design.md amendment. The builder applies them at ship time, inserts
    "12. Built, deviations (<date>)" before this section and renumbers it to 13, marked applied.

## What a spec may ask of the League, and what it may not

The League builds in a sandbox with these root scripts only: `npm run test:api`, `npm run
test:frontend`, `npm run test:file:api -- <file>`, `npm run test:file:frontend -- <file>`,
`node scripts/validate-specs.js`. It cannot:

- add or upgrade a dependency (`api/package.json`, `frontend/package.json` and the lockfiles are
  protected) — write the `npm install` as an operator step in sections 7 and 12;
- change `.github/`, `.claude/`, `.league.json`, `staticwebapp.config.json`, `api/host.json`,
  `api/scripts/`, or any secret — those specs are built by hand;
- run `swa start`, Azurite, `/local-smoke` or `/deploy-swa` — operator steps;
- read Design.md and decide for you: a spec that amends Design.md is rated `risky` and parks at
  `plan-waiting` until the owner clicks.

Specs that touch `api/src/shared/auth.ts`, the session signer or cookie, the password hasher,
`claude.ts`, the composition root `api/src/index.ts`, or a row-key format are `risky` too (see the
blast-radius table in `.claude/skills/sdd-build/SKILL.md`).

## Template

Copy from here; do not add a template file to this folder (a numbered file looks like a spec).

```markdown
---
issue: <N>
status: draft
---

# <Title>

Status: proposed, <YYYY-MM-DD>. Owner: waldo.
Scope: <…>. Every claim below was verified against the tree at `<sha>` on <date>. Not in scope: <…>.

## 1. Goal

## 2. Behaviour after

## 3. Decisions

## 4. Contract

## 5. Test plan (write first)

- AC1: <behaviour in one sentence>
  - test file: api/src/functions/<x>.test.ts | frontend/src/screens/<X>.test.jsx
  - test name: "<reads like a spec line>"
  - seams touched: <tables | claude | clock | hasher | signer | random | logger | tts | fetch | none>
  - edge cases: <…>

## 6. Tasks

## 7. Verification

## 8. Later, not in this spec

## 9. Risks and open questions

## 10. Files

## 11. Definition of Done

- [ ] …

## 12. Proposed edits to other files (not applied)
```
