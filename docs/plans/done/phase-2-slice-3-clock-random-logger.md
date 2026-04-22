---
phase: 2
slice: 3
name: Clock + Random + Logger seams
status: proposed
---

# Phase 2 · Slice 3 — `Clock`, `Random`, `Logger` seams

## 1. Task

Introduce three small seams used pervasively by later phases: `Clock`
(wall-clock abstraction for SM-2 scheduling / streaks), `Random`
(UUIDs and distractor shuffles), and `Logger` (structured-event
logging).

## 2. Scope (IN / OUT)

**IN**: interface + real + fake + unit tests for each of the three
seams. Logger enforces "first arg is a string event name, second arg
is a primitive-only attrs object" at the type level.

**OUT**: adopting these in real code — that happens incrementally as
later phases build endpoints.

## 3. Files

- `api/src/shared/clock.ts` + `api/testing/fake-clock.ts`
- `api/src/shared/random.ts` + `api/testing/fake-random.ts`
- `api/src/shared/logger.ts` + `api/testing/fake-logger.ts`
- Unit tests colocated with real/fake.

## 4. Seams

`clock`, `random`, `logger`.

## 5. RED list

Clock:
- **C1**: `SystemClock.now()` returns a `Date`; sequential calls never
  go backwards.
- **C2**: `FakeClock` starts at a given ISO, `advance(ms)` moves
  forward, `setDate(iso)` jumps.

Random:
- **R1**: `SystemRandom.uuid()` returns a v4 UUID string.
- **R2**: `FakeRandom` returns the scripted UUIDs in order; panics on
  overrun.
- **R3**: `FakeRandom.shuffle([a,b,c])` permutes deterministically per
  script.

Logger:
- **L1**: `SystemLogger.info("x", {a:1})` writes a JSON line to the
  injected sink with keys `level, event, a`.
- **L2**: `FakeLogger` records the call sequence for later assertion.
- **L3**: Logger's attrs-only type signature rejects `password` /
  `hash` / `token` / `cookie` / `apiKey` keys at the type level.

## 6. Assumptions

- `crypto.randomUUID()` available in Node 20+ (native).
- Logger uses a sink callback (`write: (line: string) => void`)
  rather than `console.log` directly so test runs are silent.

## 7. Risks

- Banned-keys type enforcement may be annoying with generic attrs.
  Mitigation: provide an `LogAttrs` helper type that excludes them.

## 8. Out-of-scope

- Adoption in handlers — later.
- `tts` seam — Phase 11.
