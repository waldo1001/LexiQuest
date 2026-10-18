# Plans — LexiQuest

In-flight TDD-cycle plan files live here. When a slice is complete, its
plan moves to [done/](done/) via the `/docs-update` skill (Step 6d).

## Naming

- Phase work: `phase-<N>-slice-<M>-<short-name>.md`
- Post-v1 work without a spec: `post-v1-<short-name>.md`
- Spec-driven work (a spec in [../specs/](../specs/), human or League build):
  `<issue>-<slug>.md`, the same name as the spec.

Examples:
- `phase-1-slice-1-scaffold-frontend.md`
- `phase-8-slice-1-sm2-pure-function.md`
- `42-reverse-card-pairing.md` (built from `docs/specs/42-reverse-card-pairing.md`)

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

A spec-driven plan adds one section, which waldo.Jarvis's plan gate reads:

```
## Blast radius

Rating: low-risk
<one or two lines on why; never put a second rating word on the Rating line>
```

The rating is one of `safe`, `low-risk`, `risky`, `breaking` (legend in
[../../.claude/skills/sdd-build/SKILL.md](../../.claude/skills/sdd-build/SKILL.md)).
`risky` and `breaking` park a League build at `plan-waiting` until the owner clicks.

After writing the plan, **post the path in chat and stop** — no code
until the user explicitly approves. In League operator mode the
`spec-approved` label is that approval for `safe` and `low-risk` plans.

## Directory contract

- `docs/plans/` — in-flight work only. Seeing a plan here means that
  slice is not yet done.
- `docs/plans/done/` — archived plans for completed slices. Never
  modified after archival (they are historical record).
- An abandoned plan stays in `docs/plans/` with a one-line note at the
  top explaining why, rather than being moved to `done/`.
- A League build cannot move files; `/sdd-review` archives its plan at merge time.
