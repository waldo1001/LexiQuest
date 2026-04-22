# Plans — LexiQuest

In-flight TDD-cycle plan files live here. When a slice is complete, its
plan moves to [done/](done/) via the `/docs-update` skill (Step 6d).

## Naming

`phase-<N>-slice-<M>-<short-name>.md`

Examples:
- `phase-1-slice-1-scaffold-frontend.md`
- `phase-2-slice-1-table-storage-seam.md`
- `phase-8-slice-1-sm2-pure-function.md`

## Contents

Every plan file follows the structure in
[../tdd/methodology.md §2.-1](../tdd/methodology.md) and
[../../.claude/skills/tdd-cycle/SKILL.md](../../.claude/skills/tdd-cycle/SKILL.md) Step 0.5:

1. Task (one sentence)
2. Scope boundary (IN / OUT)
3. Files to create / touch
4. Seams involved
5. RED test list
6. Open questions / assumptions
7. Risks
8. Out-of-scope follow-ups

After writing the plan, **post the path in chat and stop** — no code
until the user explicitly approves.

## Directory contract

- `docs/plans/` — in-flight work only. Seeing a plan here means that
  slice is not yet done.
- `docs/plans/done/` — archived plans for completed slices. Never
  modified after archival (they are historical record).
- An abandoned plan stays in `docs/plans/` with a one-line note at the
  top explaining why, rather than being moved to `done/`.
