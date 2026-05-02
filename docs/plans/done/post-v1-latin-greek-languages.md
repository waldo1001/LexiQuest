# Plan — Add Latin & Ancient Greek to course/import language pickers

## Task

Add Latin (`la`) and Ancient Greek (`grc`) as selectable options in
both the course-level **Language** dropdown and the per-side **Speak
questions in / Speak answers in** dropdowns, so users running
Belgian-curriculum *Latijn* and *Grieks* courses can pick them from
the UI.

## Scope boundary

**IN**

- `frontend/src/screens/CourseList.jsx` — extend `LANGUAGES` (course-level)
  and `SIDE_LANGS` (per-side) arrays.
- `frontend/src/screens/PhotoImport.jsx` — extend the screen-local
  `LANG_OPTIONS` array (per-side).
- `frontend/src/i18n/strings.js` — add `courses.sideLang.la` and
  `courses.sideLang.grc` keys for `en` and `nl`.
- New tests asserting the new options render in both screens.
- One-line user-guide note that Latin/Ancient Greek work but have no
  browser TTS voice.

**OUT**

- API/backend changes — none needed; the BCP-47 regex in
  [api/src/functions/courses-shared.ts:18](../../api/src/functions/courses-shared.ts:18)
  already accepts both codes.
- Claude prompt changes — already language-agnostic
  ([api/src/shared/claude.ts](../../api/src/shared/claude.ts)).
- Modern Greek (`el`) — explicitly not requested.
- Adding TTS support — no browser voices exist; gracefully degrades
  via existing `tts.js` `isAvailable()` check.
- Region tagging (`la-VA`, `grc-GR`) — user chose bare ISO codes.

## Files to create / touch

- `frontend/src/screens/CourseList.jsx` — lines 22–37 (two arrays).
- `frontend/src/screens/PhotoImport.jsx` — lines 12–19 (one array).
- `frontend/src/i18n/strings.js` — append two keys × two locales.
- `frontend/src/screens/CourseList.test.jsx` — new test for new
  options in both dropdowns.
- `frontend/src/screens/PhotoImport.test.jsx` — new test for new
  options in `LANG_OPTIONS`.
- `docs/user-guide.md` — short note about TTS unavailability.
- `docs/changelog.md` — bullet for the change.

## Seams involved

`none` — pure UI/data extension. No new mock plumbing needed.

## RED test list

- **AC1**: Course-level `LANGUAGES` dropdown offers `la` and `grc`.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"CL-langs: course-level language dropdown includes la and grc"`
  - seams: none
  - edge cases: option visible when New Course form is open; user can
    select either and the value is submitted to `createCourse`.

- **AC2**: Per-side `SIDE_LANGS` dropdowns (question/answer language
  defaults inside the edit form) offer `la` and `grc` with localized
  endonym labels.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"CL-langs: side-language dropdowns include Latin and Ancient Greek"`
  - seams: none
  - edge cases: Dutch label shows "Latijn" / "Oudgrieks"; English
    shows "Latin" / "Ancient Greek".

- **AC3**: PhotoImport `LANG_OPTIONS` dropdown offers `la` and `grc`.
  - test file: `frontend/src/screens/PhotoImport.test.jsx`
  - test name: `"PI-langs: language dropdown includes Latin and Ancient Greek"`
  - seams: none
  - edge cases: option appears in both question-side and answer-side
    pickers (same source array).

## Open questions / assumptions

- **Decided** (via AskUserQuestion): Ancient Greek (`grc`), bare codes.
- **Assumption**: PhotoImport's `LANG_OPTIONS` should also include the
  new languages — without that, users cannot pick them when importing
  cards. Plan adds them.
- **Assumption**: Course-level dropdown shows raw codes (`la`, `grc`)
  matching the existing `fr-FR / nl-BE / en-GB / de-DE` style. No new
  i18n keys needed for the LANGUAGES array.

## Risks

- **Mistyped option `value`** would break round-trip persistence — the
  RED tests assert the literal string value, mitigating this.
- **Coverage drift** unlikely — the change is data-only inside files
  already covered by Tier B tests.

## Out-of-scope follow-ups

- If the user later wants a "course type = classical language" group
  in the dropdown, that's a separate UX change.
- Modern Greek (`el`) can be added later with the same shape if
  requested.
