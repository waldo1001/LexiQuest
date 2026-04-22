# AI-Maintainability Rules — LexiQuest

This codebase will be extended across many Claude sessions with no shared
memory. Code that Claude-next can't understand from a cold read is code that
will decay. These rules exist to keep the codebase legible to both humans
and future AI contributors.

These are non-negotiable during REVIEW.

---

## 1. Explicit over clever

- Prefer long, descriptive names to short clever ones. `nextReviewAt` not
  `nra`. `cardsStudiedFirstTryCorrect` not `acc`. `sessionDurationSeconds`
  not `t`.
- Prefer straight-line code to chained abstractions. A 20-line function with
  a clear name beats a 5-line function that calls four helpers that each
  call two more.
- Prefer explicit types on every public function signature (API) or JSDoc
  `@param` / `@returns` on every public function (frontend JS). Never rely
  on inference at module boundaries.
- Never use non-null assertion `!` to silence the TypeScript checker. If the
  value really can't be null, narrow it with a check and throw with a
  message that explains why it was unreachable.

## 2. Every public function is a spec

Public = exported from a module. Every public function must have:

- An explicit parameter type and return type (TS) or complete JSDoc (JS).
- A test whose name reads like a behavioral specification (see methodology §4).
- No side effects beyond those visible in the return type. If a function
  writes to Table Storage, the return type should say so
  (`Promise<UpsertResult>`, not `Promise<void>` with a hidden side effect).

If a reader can't infer what the function does from its name, parameter
types, return type, and test names alone, rename or split it.

## 3. Seams are contracts, not implementation details

Every injected dependency (see [testability-patterns.md](testability-patterns.md))
is declared as an `interface` or JSDoc typedef in its own file, with:

- A doc comment on every method explaining the contract (inputs, outputs,
  error modes, idempotency).
- A contract test suite that every implementation (real + fake) must pass.

This is how Claude-next knows what the fake is allowed to simplify and what
it isn't.

## 4. Errors carry context

- Never `throw new Error("failed")`. Include what failed, what it was trying
  to do, and what the relevant identifiers were:
  `throw new Error(\`SM-2 apply failed for card=\${cardId} quality=\${q}: \${cause.message}\`)`
- Prefer typed error classes at module boundaries
  (`InvalidSessionError`, `EntityNotFoundError`, `ClaudeJsonParseError`,
  `CrossUserWriteError`) so callers can discriminate.
- Every `catch` either handles the error meaningfully or rethrows. Never
  swallow, never log-and-continue unless the business rule is explicitly
  "log and continue to next card" (and then the test asserts on the log).
- Error messages must NEVER interpolate password hashes, session tokens,
  or API keys. Name the user/session/operation (public), not the
  credential (secret).

## 5. No magic values

- No unnamed numbers in logic. `14 * 24 * 60 * 60 * 1000` → `const STREAK_FREEZE_CADENCE_MS = ...`.
- No unnamed strings as discriminators. `mode === "mcq"` is fine only if
  `SessionMode` is a string literal union type (`"self_grade" | "mcq" | "mixed" | "ask"`).
- Config values come from `api/shared/config.ts`, never from inline
  `process.env` reads in handlers.
- SM-2, XP, and badge constants live in one file each (`api/shared/sm2.ts`,
  `api/shared/xp.ts`) so tuning doesn't require a repo-wide grep.

## 6. Files are small and single-topic

- A file's name predicts its contents. `sm2.ts` contains SM-2 scheduling
  logic and nothing else. `study-session.jsx` renders the study session
  screen and nothing else.
- Hard cap: 300 lines per file. At 300, split. The split itself is a
  REFACTOR step under a green test suite.
- One exported "main" function per file is the ideal. Helpers for that
  function are private (non-exported) in the same file.

## 7. Comments explain *why*, never *what*

- Delete any comment that describes what the next line does. The code
  already says what; a comment repeating it just rots.
- Keep comments that describe *why* a non-obvious choice was made:
  ```ts
  // SM-2 interval=1 for both reps=0 first pass AND any quality<3 reset, so
  // the card repeats tomorrow in both cases. The difference is in reps/ease,
  // not in the interval — this is the canonical SM-2 behavior.
  ```
- Keep TODO comments only if they reference a phase or a specific trigger
  ("TODO: revisit once Phase 14 stats endpoints exist"). Bare `TODO: fix` rots.

## 8. Deterministic by default

- No wall-clock reads in business logic. Always `deps.clock.now()` /
  `deps.clock.today(tz)`.
- No random reads in business logic. Always `deps.random.shuffle(...)` /
  `deps.random.uuid()`.
- No reliance on Map/Set insertion order for correctness. If order matters,
  sort explicitly (especially for Table Storage row-key prefix queries, where
  lexicographic order is load-bearing).
- No reliance on filesystem or network ordering.

Non-determinism is the most expensive bug class because it's intermittent.
Engineer it out at the seam. Session queues, retry piles, and mixed-mode
coin flips must all route through `Random` so tests can pin their order.

## 9. Logs are structured and queryable

- Every log line is `logger.info("event_name", { ...structured })`, never
  a formatted string.
- Events use `snake_case` names that read as past-tense facts:
  `"session_started"`, `"session_closed"`, `"sm2_rescheduled"`,
  `"claude_extract_succeeded"`, `"login_failed"`.
- Log primitive context only: `userId`, `courseId`, `cardId`, `sessionId`,
  counts, durations, status codes.
- Never log: password hashes, bcrypt rounds output, session tokens, cookie
  values, full Claude request/response bodies, base64 image payloads, card
  answer text (family-visible but still private to the kid studying).
- Never `console.log` in `api/src/` or `frontend/src/`. Use the structured
  logger.

## 10. Tests are documentation

- A new contributor (human or AI) should be able to understand what a
  module does by reading its test file alone.
- Every test has a single clear assertion focus. Multi-assert tests are OK
  if they assert on one cohesive outcome (e.g. "card was upserted AND
  attempt was logged AND SM-2 fields updated" = one outcome: "attempt
  processed").
- Tests never import from `../../../` chains deeper than 2. If they do,
  the module layout is wrong.

## 11. No dead code, no commented-out code

- Delete unused exports. Git remembers; the file shouldn't.
- Never check in commented-out code "in case we need it".
- Unused parameters prefixed with `_` are allowed only in interface
  implementations where the param exists for the contract.

## 12. Storage row-key format is load-bearing

Per Design.md §3.3, attempts and sessions use row-key
`{isoTimestamp}_{uuid}` so date-range queries via row-key prefix work. This
is not a stylistic choice — it is how the stats aggregation queries run
without scanning the whole partition.

Rules:
- ISO timestamps in row keys use `YYYY-MM-DDTHH:mm:ss.sssZ` (lexicographic
  sort = chronological sort).
- Never omit milliseconds — two attempts in the same second must still sort
  deterministically.
- The `{uuid}` tiebreaker is required. Two attempts with identical
  timestamps must not collide on primary key.
- A meta-test asserts the row-key format for every write path into
  `attempts` and `sessions`.

## 13. LexiQuest invariants are enforced by meta-tests

See [testability-patterns.md §6](testability-patterns.md) for the full list.
In short:

- `user_id` always from session, never from body → `auth-boundary.test.ts`.
- Stats endpoints return aggregates only → `stats-privacy.test.ts`.
- AI import never persists without review → `cards-import` handler test.
- Password hashes / session tokens never leak → `/security-scan` patterns.

These meta-tests block merges in CI.

---

## Review checklist (paste into PR description or commit message)

```
AI-maintainability review:
- [ ] All public functions have explicit types (TS) or complete JSDoc (JS)
- [ ] All seams are interfaces with contract tests
- [ ] No magic values, no free-form string discriminators
- [ ] No direct imports of side-effect modules in business logic
- [ ] No wall-clock or random reads outside the composition root
- [ ] All errors carry context identifiers
- [ ] All logs are structured events
- [ ] Row keys for attempts/sessions are `{isoTimestamp}_{uuid}` format
- [ ] No dead code, no commented-out code, no orphan fixtures
- [ ] All tests pass, full suite
- [ ] Coverage ≥ tier threshold on touched files
- [ ] Every acceptance criterion traces to a named test
- [ ] LexiQuest invariants (§13) still hold
```
