# Plan — Phase 11 Slice 3: auto_speak setting

## Task
Add `auto_speak` toggle to Settings; when on, StudySession auto-speaks
question on card show and answer on answer reveal.

## Files to touch
- `frontend/src/i18n/strings.js` — add settings.autoSpeak key
- `frontend/src/screens/Settings.jsx` — checkbox wired to user.settings.auto_speak
- `frontend/src/screens/Settings.test.jsx` — 3 new tests
- `frontend/src/screens/StudySession.jsx` — useEffect auto-speak on phase change
- `frontend/src/screens/StudySession.test.jsx` — 3 new auto-speak tests

## RED test list
- AC1: Settings shows auto_speak checkbox
- AC2: checkbox reflects user.settings.auto_speak value
- AC3: toggling checkbox calls patchMe({ settings: { auto_speak: true/false } })
- AC4: StudySession auto-speaks question when auto_speak true + canSpeak
- AC5: StudySession auto-speaks answer on reveal when auto_speak true + canSpeak
- AC6: no auto-speak when auto_speak false
