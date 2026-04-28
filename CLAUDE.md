# CLAUDE.md — LexiQuest

Design document: [Design.md](Design.md)
Progress: [PROGRESS.md](PROGRESS.md)

## Non-negotiable: Test-Driven Development

Every code change in this workspace — new feature, bug fix, refactor —
follows the TDD cycle defined in [docs/tdd/methodology.md](docs/tdd/methodology.md).

**The loop** (never skip a step, never merge steps):

0. **PLAN** — write a markdown plan under [docs/plans/](docs/plans/) for
   the next slice: task, scope boundary, files to touch, seams, RED
   test list, risks, out-of-scope. **Stop and wait for explicit user
   approval of the plan before doing anything else.** No FRAME, no RED,
   no code until the plan is acknowledged.
1. **FRAME** — post a ≤150-word framing: goal of this step, where it
   stands in the project, why it is needed, what it contributes. See
   [docs/tdd/methodology.md §2.0](docs/tdd/methodology.md).
2. **RED** — write a failing test that encodes the requirement.
3. **PROVE RED** — run it, observe the failure, confirm the failure
   message is about the thing under test (not a typo, not a missing
   import).
4. **SCAFFOLD** — add only the minimum shape (files, exports, types,
   seams) so the test *can* fail for the right reason.
5. **GREEN** — write the smallest implementation that turns the test
   green.
6. **REFACTOR** — clean up with the tests as a safety net. Tests stay
   green.
7. **COVER** — verify tier-appropriate coverage on touched files
   (Tier A 90% for `api/` and `frontend/src/lib/`; Tier B 70% for
   `frontend/src/screens/`, `components/`, `charts/`) and that every
   acceptance criterion has at least one named test.
8. **SECURITY SCAN** — run [`/security-scan`](.claude/skills/security-scan/SKILL.md).
   A finding blocks the cycle. Never "note and continue".
9. **UPDATE DOCS** — run [`/docs-update`](.claude/skills/docs-update/SKILL.md)
   to update the [changelog](docs/changelog.md), PROGRESS, and any
   user-visible docs.
10. **REVIEW** — run the self-review checklist in
    [docs/tdd/methodology.md §2.8](docs/tdd/methodology.md).

Before writing any implementation code, **post the PLAN (and get approval),
then the FRAME, then the RED test list** in chat. Before calling a task
done, **cite the test names that cover each requirement**.

## Autonomous mode (batch-slice runs)

When the user initiates a batch run ("go", "do it", "implement all slices",
"step by step no stopping"), switch to this abbreviated cycle for every slice
until the phase is done or a blocker appears. See
[docs/tdd/methodology.md §10](docs/tdd/methodology.md) for rationale.

**Per-slice loop** — no approval gate, no stopping between slices:

1. Keep the plan in-context — no plan file written to disk.
2. Post a single line: `Slice N — <name>` and proceed immediately.
3. **RED** — write failing tests encoding the requirements.
4. **PROVE RED** — run only the new test file; confirm meaningful failure.
5. **SCAFFOLD** — minimum shape so the failure is an assertion error, not a structural error.
6. **GREEN** — smallest implementation that turns the tests green.
7. **REFACTOR** — clean up under green tests.
8. **COVER** — verify tier-appropriate thresholds on every touched file.
9. **Security scan** — only when the slice touches `SessionSigner`,
   `PasswordHasher`, `requireAuth`, or `ClaudeClient`. Skip for pure UI
   and non-auth API slices.
10. Update PROGRESS.md inline (mark the slice ✅). Do not run `/docs-update`.
11. Commit and push — one commit per slice, message: `Phase N Slice M — <name>`.

**End of phase**: run `/docs-update` once to sync changelog, setup,
getting-started, and user-guide.

**Stop and ask** only for: a missing Azure/Anthropic credential, a destructive
operation, or an architectural ambiguity that Design.md does not resolve.

## Supporting documents

- [Design.md](Design.md) — authoritative design. Sections 1–5 are
  reference; section 6+ is the 17-phase implementation plan.
- [PROGRESS.md](PROGRESS.md) — where we are in the 17 phases.
- [docs/tdd/methodology.md](docs/tdd/methodology.md) — the full TDD
  workflow, RED/GREEN/REFACTOR rules, definition-of-done.
- [docs/tdd/testability-patterns.md](docs/tdd/testability-patterns.md) —
  how to make LexiQuest's seams (Table Storage, Claude, clock, password
  hasher, session signer, random, logger, fetch, TTS) mockable. Also
  the four LexiQuest invariants in §6.
- [docs/tdd/ai-maintainability.md](docs/tdd/ai-maintainability.md) —
  rules that keep the codebase legible to both humans and future
  Claude sessions.
- [docs/tdd/coverage-policy.md](docs/tdd/coverage-policy.md) — tiered
  thresholds, exclusions, enforcement.
- [testing/](testing/) — drop-in Vitest configs (one for `api/` TS, one
  for `frontend/` JS), dev-dep manifests, and example test scaffolds.
  Copy into the respective subproject when it's scaffolded in Phase 1.

## Repo-local skills

- [`/tdd-cycle`](.claude/skills/tdd-cycle/SKILL.md) — invoke at the
  **start** of any coding task. Walks PLAN → FRAME → RED → GREEN →
  REFACTOR → COVER → SECURITY → DOCS → REVIEW and produces the RED
  test list before any production code is written.
- [`/security-scan`](.claude/skills/security-scan/SKILL.md) — invoked
  from Step 10 of `/tdd-cycle` and before any commit/push. Scans for
  secrets, bcrypt/HMAC/Anthropic shapes, real family data in fixtures,
  log hygiene, error-message leakage, and — once the subprojects exist
  — `npm audit` findings. A finding blocks the cycle.
- [`/docs-update`](.claude/skills/docs-update/SKILL.md) — invoke at the
  **end** of any coding task. Keeps [docs/changelog.md](docs/changelog.md),
  [PROGRESS.md](PROGRESS.md), [docs/setup.md](docs/setup.md),
  [docs/getting-started.md](docs/getting-started.md), and
  [docs/user-guide.md](docs/user-guide.md) in sync with reality.
- [`/dev-start`](.claude/skills/dev-start/SKILL.md) — invoke when the
  user wants to run the app in the browser locally. Starts Azurite,
  Vite, and SWA CLI with the `ANTHROPIC_API_KEY` injected correctly
  from `api/local.settings.json`. Always tears down any existing dev
  stack first (delegates to `/dev-stop`), then starts clean — never
  attaches to a running stack. Includes the key pitfall: SWA skips
  local.settings.json values for env vars already exported (even if
  empty), which causes 502 on `/api/cards/import`.
- [`/dev-stop`](.claude/skills/dev-stop/SKILL.md) — kills every
  LexiQuest dev process (Azurite, Vite, Functions host, SWA CLI) and
  frees ports 4280/5173/7071/10000-10002. Idempotent. Use to clean up
  orphaned background processes when no terminal is attached, or as a
  teardown after a debug session.
- [`/local-smoke`](.claude/skills/local-smoke/SKILL.md) — invoke before
  `/deploy-swa` (or whenever the user says "smoke test"). Boots
  `swa start` against Azurite on a non-default port and exercises the
  login / `/api/me` / SPA-fallback critical path. Catches boot-path
  regressions that `npm test` can't — env wiring, composition-root
  construction, staticwebapp.config.json routes.
- [`/deploy-swa`](.claude/skills/deploy-swa/SKILL.md) — invoke when
  shipping to production. Pushes `main`, watches the GitHub Actions run
  that triggers the SWA deploy, probes the live URL, reports. Never
  force-pushes, never rotates secrets.

A task is not done until all three coding skills (tdd-cycle,
security-scan, docs-update) have been run. `/local-smoke` and
`/deploy-swa` are separate operator workflows, invoked when you want to
ship — not part of the coding-task definition-of-done.

GitHub Copilot uses the **same** toolchain via
[.github/copilot-instructions.md](.github/copilot-instructions.md), which
points at the files above rather than duplicating them. Keep that file
in sync when the toolchain structure changes (new skill, renamed doc).

## Project-specific invariants (enforced in code and tests)

These four rules have architectural weight. They are enforced both in
code review and by specific meta-tests — see
[docs/tdd/testability-patterns.md §6](docs/tdd/testability-patterns.md)
for the full rationale and the meta-test locations.

1. **`user_id` is derived from the session, never from the request body.**
   Every protected API handler MUST read `userId` from
   `requireAuth(req).userId`. The body's `userId` (if present) is
   ignored or rejected. Meta-test: `api/__meta__/auth-boundary.test.ts`.
2. **Stats endpoints return aggregates only.** `api/stats-*` handlers
   MUST NOT return raw `attempts` or `sessions` rows for users other
   than the caller. The "everyone sees everyone" rule in Design.md §5.8
   applies to aggregates, not raw rows. Meta-test:
   `api/__meta__/stats-privacy.test.ts`.
3. **AI import always routes through Import Review.**
   `POST /api/cards/import` returns card candidates, never persists
   them. Persistence happens via `POST /api/cards/batch` after user
   confirmation in the Import Review screen. A memorized wrong card is
   worse than no card.
4. **Password hashes and session tokens never leave their boundary.**
   Hashes NEVER appear in API responses, logs, error messages,
   fixtures, or snapshots. Session tokens NEVER appear in logs or error
   messages — log the `userId` instead. Enforced by
   [`/security-scan`](.claude/skills/security-scan/SKILL.md).

## Tech-stack reminders (from Design.md §4.1)

- **Frontend**: React + Vite, **JavaScript**. 70% coverage floor on
  screens/components/charts.
- **API**: Azure Functions, **TypeScript**, Node.js 20. 90% coverage
  floor per file.
- **Storage**: Azure Table Storage via `@azure/data-tables` (behind the
  `TableStorage` seam). Local dev uses Azurite.
- **Auth**: HMAC-signed HTTP-only session cookies. No JWT, no
  localStorage.
- **AI**: Anthropic Claude via `@anthropic-ai/sdk` (behind the
  `ClaudeClient` seam).
- **Deploy**: push to `main` → GitHub Actions → Azure Static Web Apps.
- **Time-sensitive logic** (SM-2 scheduling, streaks, daily goal)
  routes through the `Clock` seam — all timezone math uses
  `Europe/Brussels`.
