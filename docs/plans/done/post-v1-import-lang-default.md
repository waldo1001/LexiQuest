# Plan — Import language defaults: both default to user's language

## Task

Change the PhotoImport screen so that both the "Speak questions in" and
"Speak answers in" dropdowns default to the user's UI language instead of
questionLang defaulting to the course language.

## Scope boundary

**IN**: Change the fallback for `questionLang` in `PhotoImport.jsx` from
`baseTag(courseLang)` to `baseTag(uiLang)`. Update affected tests.

**OUT**: API-side behavior (unchanged — it receives whatever the frontend
sends). Course-level `questionLangDefault` override (still honored when
set). TTS playback logic.

## Files to touch

- `frontend/src/screens/PhotoImport.jsx` — line 35, change fallback
- `frontend/src/screens/PhotoImport.test.jsx` — update 3 tests whose
  expectations assert the old default

## Seams involved

none

## RED test list

- AC1: Both language dropdowns default to the user's UI language when no
  course-level defaults are set.
  - test file: `frontend/src/screens/PhotoImport.test.jsx`
  - test name: "defaults both language dropdowns to the user's UI language"
  - seams: none
  - edge cases: uiLang with region suffix (e.g. "fr-FR" → stripped to "fr")

- AC2: Course-level `questionLangDefault` still takes precedence when set.
  - test file: `frontend/src/screens/PhotoImport.test.jsx`
  - test name: "uses course-level lang defaults as dropdown values when set"
    (existing test — should still pass unchanged)
  - seams: none
  - edge cases: none

- AC3: The payload sent to importCards reflects the new default.
  - test file: `frontend/src/screens/PhotoImport.test.jsx`
  - test name: "passes questionLang and answerLang to importCards"
    (existing test — expectation updates to match new default)
  - seams: none
  - edge cases: none

## Open questions / assumptions

- **Assumption**: "the user's language" means `uiLang` from AppContext
  (the app-wide language toggle, "en" or "nl"). Confirmed by the existing
  `answerLang` fallback logic which already uses `baseTag(uiLang)`.

## Risks

- Minimal — this is a one-line default change with no backend impact.
  The user can still manually select any language from the dropdown.

## Out-of-scope follow-ups

- none
