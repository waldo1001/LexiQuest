---
name: docs-update
description: Update the /docs folder at the end of a coding task. Use immediately after a `/tdd-cycle` completes (or any meaningful workspace change) to refresh the changelog, setup, getting-started, user guide, and PROGRESS as needed. Invoke proactively — documentation staleness is a bug.
---

# /docs-update — LexiQuest documentation enforcer

This skill runs at the END of every coding task, after `/tdd-cycle` has
finished. It ensures the `/docs` folder, the root `README.md`, and
`PROGRESS.md` stay in sync with the code.

## Step 0 — Load the docs index

Re-read [docs/README.md](../../../docs/README.md) so you know which files
exist and what each one is for.

## Step 1 — Classify the change

Answer in chat, then let the answers drive which files you touch:

1. **What changed?** One sentence.
2. **Is it user-visible?** (new screen, new CLI behavior via `swa start`,
   new env var, changed error message, changed defaults, changed file layout)
   → yes/no
3. **Does it change setup steps?** (new dependency, new Azure service,
   new env var, new local-dev command, new seed step) → yes/no
4. **Does it change the getting-started flow?** (anything in the
   five-minute happy path for a new dev on this repo) → yes/no
5. **Is it a new surface family members should know about?** (new study
   mode, new import flow, new stats screen, new gamification rule) → yes/no
6. **Does it touch project scope, status, or architecture?** (phase
   completed, new deployment target, new runtime dep, new top-level doc)
   → yes/no. If yes → the root [README.md](../../../README.md) AND
   [PROGRESS.md](../../../PROGRESS.md) must be updated.

## Step 2 — Always update the changelog

Every task that touched code or docs gets a changelog entry. Never skip this.

Open [docs/changelog.md](../../../docs/changelog.md):

- If there's already an entry for today's date at the top, append a bullet
  to it.
- If not, create a new `## YYYY-MM-DD` section at the top (reverse
  chronological — newest first).
- Bullets are summier: one line, past tense, plain English, link to the
  most relevant file or PROGRESS milestone. No prose paragraphs.

Good:
```
## 2026-04-22

- Implemented `applySm2` with RED list covering quality-0 reset, rep-1 → 6-day,
  rep-2+ × ease, and the 1.3 ease floor.
- Added `FakeClock` + `SystemClock` seam in `api/shared/clock.ts`.
```

Bad (too verbose, reads like commit message):
```
## 2026-04-22

- Today I worked on implementing the SM-2 algorithm from §5.3 of
  Design.md. It needed to handle several cases including...
```

## Step 3 — Update setup.md if setup changed

If Step 1 Q3 = yes:

- New env var → add to the `.env` / `local.settings.json` block in
  [docs/setup.md](../../../docs/setup.md).
- New dependency → add to prerequisites and install steps.
- New Azure service → add to provisioning section.
- New seed step → add to "First run" section.
- New troubleshooting case → append to the Troubleshooting section.

## Step 4 — Update getting-started.md if the five-minute path changed

If Step 1 Q4 = yes:

Touch the minimum needed to keep the happy path accurate. Anything
optional or advanced belongs in setup.md or user-guide.md. Getting-started
stays five minutes long, always.

## Step 5 — Update user-guide.md if family users should know

If Step 1 Q5 = yes:

- New study mode → add to "Studying" with a worked example.
- New stats screen → add to "Stats" section.
- New gamification rule → add to "Gamification" with the XP math.
- New workflow (AI import, enrich, backup) → add to "Daily workflows".

## Step 6a — Update PROGRESS.md if a phase slice advanced

If the change closed a slice or a full phase, update
[PROGRESS.md](../../../PROGRESS.md):

- Mark the slice checkbox complete.
- If the full phase is done, record the smoke-test outcome and tag
  reference (`phase-N-done`).
- Keep PROGRESS.md as the single source of "where are we in the 17-phase
  plan".

## Step 6b — Update the root README.md if scope / status / architecture changed

If Step 1 Q6 = yes, update [README.md](../../../README.md):

- **Status change** → update the "Status" paragraph (current phase,
  what's proven, what's next).
- **Architecture change** → update the architecture summary.
- **New top-level doc** → add it to "Documentation map".
- **New non-goal** → add it to "What it is NOT".

The README is the project's front door. A stale front door is worse than
no front door.

## Step 6c — Update the docs index if files moved or were added

If you added or removed a file under `/docs/`, update
[docs/README.md](../../../docs/README.md) so it points to every file that
exists and none that don't.

## Step 6d — Archive the plan

If this task had a plan file at `docs/plans/<name>.md` and the slice / task
is now complete (tests green, docs updated, ready to ship), **move the
plan to `docs/plans/done/<name>.md`**.

- Use `git mv docs/plans/<name>.md docs/plans/done/<name>.md` so history
  is preserved.
- Update every reference to the old path in this repo (PROGRESS.md,
  changelog.md, other docs, skill files).
- `docs/plans/` stays for in-flight plans only. `docs/plans/done/` is the
  archive.
- If the task was abandoned rather than completed, do NOT move — leave it
  in `docs/plans/` with a one-line note at the top explaining why.
- If a plan covers multiple slices and only some are done, leave it in
  `docs/plans/` until the last slice closes.

## Step 7 — Cross-reference check

Before marking done, run these checks:

- [ ] If scope / status / architecture changed, the root README reflects it.
- [ ] If a phase slice advanced, PROGRESS.md reflects it.
- [ ] Every new file under `/docs/` is linked from
      [docs/README.md](../../../docs/README.md).
- [ ] The changelog bullet links to the most relevant doc or to the
      plan / PROGRESS milestone.
- [ ] No doc still references something you just removed (grep for the
      old name).
- [ ] No doc mentions a feature that was reverted.
- [ ] Dates are absolute (`2026-04-22`), never relative (`today`,
      `yesterday`, `last week`).

## Step 8 — Report

Post a short summary in chat:

```
Docs updated.
- Changelog: appended <N> bullets to YYYY-MM-DD
- PROGRESS: <slice/phase advanced | unchanged>
- Root README: <changed sections | unchanged>
- Setup: <changed sections | unchanged>
- Getting started: <changed | unchanged>
- User guide: <changed sections | unchanged>
- Docs index: <updated | unchanged>
- Plan archived: <docs/plans/done/<name>.md | n/a — plan still in-flight>
```

---

**Reminder**: documentation that doesn't get updated at the moment of the
change never gets updated. This skill is not optional. If a `/tdd-cycle`
completes without a `/docs-update`, the task is not done.
