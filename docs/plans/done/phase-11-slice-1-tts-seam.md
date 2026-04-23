# Plan — Phase 11 Slice 1: Tts seam

## Task
Create the `Tts` seam: `frontend/src/lib/tts.js` (real + interface), `frontend/src/testing/fake-tts.js` (fake), and wire `tts` into `AppContext` so any screen can call `useTts()`.

## Scope boundary
**In**: `tts.js` module, `createFakeTts`, `useTts()` hook in `AppContext`, wire into `App.jsx`.
**Out**: 🔊 buttons on screens (Slice 2), `auto_speak` setting (Slice 3).

## Files to create / touch
- `frontend/src/lib/tts.js` — NEW
- `frontend/src/lib/tts.test.js` — NEW
- `frontend/src/testing/fake-tts.js` — NEW
- `frontend/src/context/AppContext.jsx` — add `tts` prop + `useTts()`
- `frontend/src/context/AppContext.test.jsx` — tests for `useTts()`
- `frontend/src/App.jsx` — wire real `createTts(window.speechSynthesis)` into `<AppProvider>`
- `frontend/vitest.config.js` — add Tier A threshold for `src/lib/tts.js`

## Seams involved
`tts`

## RED test list
- AC1: `isAvailable(lang)` returns `false` when speechSynthesis is null/undefined
- AC2: `isAvailable(lang)` returns `true` when voices not yet loaded (empty array)
- AC3: `isAvailable(lang)` returns `true` when at least one loaded voice matches the lang prefix
- AC4: `isAvailable(lang)` returns `false` when voices loaded but none match
- AC5: `isAvailable` matches on language prefix (fr-CA satisfies fr-FR request)
- AC6: `speak` is a no-op when speechSynthesis is null
- AC7: `speak` cancels current speech then speaks the utterance
- AC8: `speak` sets correct lang and rate on the utterance
- AC9: `speak` defers until `onvoiceschanged` when voices not yet loaded
- AC10: `speak` clears the `onvoiceschanged` handler after firing
- AC11: `useTts()` returns the `tts` object injected into `AppProvider`
- AC12: Default no-op tts has `isAvailable → false`, `speak` does nothing

## Assumptions
- `SpeechSynthesisUtterance` constructor injected as second arg for testability
- Module-level `createTts(window.speechSynthesis)` in `App.jsx` is safe in jsdom (returns no-op tts because `window.speechSynthesis` is undefined there)

## Risks
- Existing AppContext tests must still pass after `tts` is added to context value

## Out-of-scope follow-ups
- 🔊 buttons in StudySession and CardManager (Slice 2)
- `auto_speak` toggle in Settings (Slice 3)
