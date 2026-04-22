# GitHub Copilot instructions — LexiQuest

GitHub Copilot (Chat, inline suggestions, Copilot Coding Agent, Copilot for
PRs) must follow the **same TDD toolchain** as every other AI contributor in
this repo. Do not reinvent it. Do not suggest code that bypasses it.

**The toolchain is defined in these files — read them before suggesting
anything non-trivial:**

- [../CLAUDE.md](../CLAUDE.md) — the prime directive. The cycle is:
  `PLAN → FRAME → RED → PROVE RED → SCAFFOLD → GREEN → REFACTOR → COVER → SECURITY SCAN → UPDATE DOCS → REVIEW`.
- [../Design.md](../Design.md) — authoritative design doc and 17-phase
  implementation plan.
- [../docs/tdd/methodology.md](../docs/tdd/methodology.md) — full
  workflow, the RED list convention, definition-of-done, and self-review
  checklist.
- [../docs/tdd/testability-patterns.md](../docs/tdd/testability-patterns.md)
  — composition root + Deps pattern; every seam (Table Storage, Claude,
  clock, password hasher, session signer, random, logger, fetch, TTS) is
  injected as an interface. §6 documents the four LexiQuest invariants.
- [../docs/tdd/ai-maintainability.md](../docs/tdd/ai-maintainability.md)
  — code rules (explicit types, no magic values, structured logs, no
  dead code, deterministic-by-default, row-key format, etc.).
- [../docs/tdd/coverage-policy.md](../docs/tdd/coverage-policy.md) — Tier A
  ≥90% on `api/` + `frontend/src/lib/`, Tier B ≥70% on
  `frontend/src/screens/`, `components/`, `charts/`.
- [../.claude/skills/tdd-cycle/SKILL.md](../.claude/skills/tdd-cycle/SKILL.md)
  — the stepwise runbook. Copilot sessions follow the same steps.
- [../.claude/skills/security-scan/SKILL.md](../.claude/skills/security-scan/SKILL.md)
  — gates the cycle before docs; blocks on any leak.
- [../.claude/skills/docs-update/SKILL.md](../.claude/skills/docs-update/SKILL.md)
  — gates the cycle before review; updates changelog + user-visible docs + PROGRESS.
- [../testing/README.md](../testing/README.md) — drop-in Vitest configs,
  dev deps, and example fakes for every seam.

If any of the above conflicts with a Copilot default suggestion, the
toolchain wins.

---

## Rules for Copilot suggestions

1. **Tests before code.** Never suggest an implementation for a function
   that does not yet have a failing test. If the user asks for code
   without a test, reply with a RED test first and explain why.
2. **Inject all seams.** Never suggest `import` of `@azure/data-tables`,
   `@anthropic-ai/sdk`, `bcryptjs`, `node:crypto`, `fetch`, `Date.now()`,
   `new Date()`, `Math.random()`, or `crypto.randomUUID()` outside the
   single file that owns that seam (see
   [testability-patterns.md §5](../docs/tdd/testability-patterns.md)).
   Suggest an injected interface instead.
3. **Structured logs only.** Never suggest `console.log` in `api/src/`
   or `frontend/src/`. Use
   `logger.info("snake_case_event_name", { ...primitives })`. Never log
   passwords, bcrypt hashes, session tokens, cookie values, Claude API
   keys, Azure connection strings, or full Claude / base64 image payloads.
4. **No magic values.** Named constants or literal-union types, never
   free-form strings as discriminators. SM-2, XP, badge constants live in
   one file each.
5. **Explicit types (TS) or JSDoc (JS) on public functions.** Never rely
   on inference at module boundaries.
6. **No secrets, ever.** Do not suggest hardcoded Anthropic API keys,
   Azure connection strings, session secrets, bcrypt hashes, or real
   family identifiers in fixtures, snapshots, tests, or comments. Use
   `Alice`/`Bob`/`Carol`/`Dan`, placeholder GUIDs, synthetic card
   content. Real identifiers are only allowed in the allowlisted docs
   named in
   [security-scan SKILL.md §3](../.claude/skills/security-scan/SKILL.md).
7. **Respect the four LexiQuest invariants**
   ([testability-patterns.md §6](../docs/tdd/testability-patterns.md)):
   - `user_id` from session cookie, never from request body.
   - Stats endpoints return aggregates only, never raw attempts of other
     users.
   - AI import returns candidates; persistence happens only after Import
     Review confirmation.
   - Password hashes + session tokens never in logs / errors / fixtures.
8. **Coverage ≥ tier threshold per file.** If a suggestion lands an
   uncovered branch, also suggest the test that covers it.
9. **Row-key format for `attempts` and `sessions`** is
   `{isoTimestamp}_{uuid}` with millisecond precision. Suggestions that
   write to those tables must use this format.
10. **Changelog entry.** After a non-trivial change, suggest the one-line
    bullet for [../docs/changelog.md](../docs/changelog.md) under
    today's date, and flag any
    [README.md](../README.md) / setup / getting-started / user-guide /
    PROGRESS.md sections that need updating.
11. **Security scan before commit.** Before suggesting a commit or push,
    remind the user to run the `/security-scan` checks from
    [security-scan SKILL.md](../.claude/skills/security-scan/SKILL.md).

## Copilot Chat prompt shortcut

When starting a new Copilot Chat on a coding task, paste this opener:

> Follow the LexiQuest TDD toolchain defined in
> `.github/copilot-instructions.md` and the files it links to. Start
> with the PLAN step (write a docs/plans/<name>.md, then STOP for
> approval), then FRAME (≤150 words), then the RED list, then one
> failing test at a time. Never suggest code that bypasses the seams,
> the coverage policy, the four LexiQuest invariants, or the security
> scan.

## Copilot Coding Agent / Copilot for PRs

When Copilot acts autonomously, it must:

- open with the PLAN file path and the FRAME in the PR description
- list the RED tests it added and confirm each was observed failing
  before the implementation
- include the AC-to-test traceability table
  ([methodology.md §2.6](../docs/tdd/methodology.md))
- confirm the `/security-scan` steps pass
- confirm the four LexiQuest invariants still hold (via the meta-tests)
- include the changelog diff + PROGRESS.md update and any
  README / user-guide edits

A PR without these is not reviewable and should be closed or sent back.

---

**Bottom line**: Copilot is welcome here, but it plays by the same rules
as every other contributor. The toolchain lives in the files linked
above; this file is only the pointer.
