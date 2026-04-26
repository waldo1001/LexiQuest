# Plan — Bug fix: MCQ choices reshuffle on every speed round timer tick

## Task

Memoize MCQ choice generation so choices are stable per card and do not
reshuffle on timer-induced re-renders.

## Scope boundary

**IN**: Wrap `mcqChoices` computation in `useMemo` keyed to the active
card's ID. Add a test proving choices stay stable across re-renders.

**OUT**: Timer accuracy, retry pile policy for speed rounds, any other
gaming-mode changes.

## Files to touch

- `frontend/src/screens/StudySession.jsx` — move `mcqChoices` into
  `useMemo`, place it before early returns (rules of hooks).
- `frontend/src/screens/StudySession.test.jsx` — add test for choice
  stability during speed round re-renders.

## Seams involved

none (pure render logic)

## RED test list

- AC1: MCQ choices remain stable when timer-induced re-renders occur
  - test file: `frontend/src/screens/StudySession.test.jsx`
  - test name: "speed round MCQ choices stay stable across timer re-renders"
  - seams: none
  - edge cases: none — the shuffle function is already injectable via `shuffleFn` prop

- AC2: MCQ choices re-shuffle when advancing to a new card
  - test file: `frontend/src/screens/StudySession.test.jsx`
  - test name: "MCQ choices re-shuffle when card changes"
  - seams: none
  - edge cases: retry pile (card reappears — should get fresh shuffle)

- AC3: Existing MCQ and speed round tests still pass
  - (no new test — run full suite)

## Open questions / assumptions

- **Assumption**: Using `useMemo` with the card's `id` as the key
  dependency is sufficient — card content doesn't change mid-session.

## Risks

- Low. The `shuffleFn` prop is already injected in tests, so
  deterministic shuffle tests are straightforward.

## Out-of-scope follow-ups

- The import language defaults change (separate plan already written).
