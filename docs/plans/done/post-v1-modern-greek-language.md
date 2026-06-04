# Post-v1 Slice — Modern Greek (`el`) as a first-class language

## Task
Surface Modern Greek in every language picker (course-level + both import
side-language dropdowns) with localized labels, mirroring how `la`/`grc`
were added in commit `66030af`.

## Background / why
A user tried to import photos of a **Modern Greek** school textbook
(clothing/food vocab + imperative-conjugation tables) and had no way to
mark them as Greek. The only Greek option, `grc`, is **Ancient** Greek —
a different language. The backend already accepts any BCP-47 code
(`cards-import.ts` validates shape only), so this is the same
"UI-is-the-missing-half" gap that `la`/`grc` filled: a frontend-only
change. Bonus over `la`/`grc`: browsers commonly ship a Greek TTS voice,
so the 🔊 button will actually work for Modern Greek (the existing
`tts.js` `isAvailable()` prefix match on `el` handles this with no code
change).

## Scope boundary
**IN:**
- Add `el-GR` to `LANGUAGES` (course-level) in `CourseList.jsx`.
- Add `el` to `SIDE_LANGS` (`CourseList.jsx`) and `LANG_OPTIONS`
  (`PhotoImport.jsx`).
- Add i18n key `courses.sideLang.el` to the `en` and `nl` locale blocks
  in `strings.js` ("Greek" / "Grieks").
- Tests mirroring the `la`/`grc` tests in `CourseList.test.jsx` and
  `PhotoImport.test.jsx`.

**OUT (deferred):**
- Any backend change (none needed — BCP-47 regex already passes `el`).
- Distinguishing Ancient vs Modern in the AI extraction prompt beyond the
  injected code.
- The unrelated in-tree Slice 3 PDF re-split work — left untouched, not
  committed by this slice.
- Extracting the three duplicated language lists into one shared module
  (worthwhile, but a separate refactor slice).

## Files to create / touch
- `frontend/src/screens/CourseList.jsx` — `LANGUAGES` + `SIDE_LANGS`.
- `frontend/src/screens/PhotoImport.jsx` — `LANG_OPTIONS`.
- `frontend/src/i18n/strings.js` — `courses.sideLang.el` in `en` + `nl`.
- `frontend/src/screens/CourseList.test.jsx` — extend lang tests.
- `frontend/src/screens/PhotoImport.test.jsx` — extend lang test.
- `docs/changelog.md`, `docs/user-guide.md`, `PROGRESS.md` — via `/docs-update`.

## Seams involved
none (pure UI + i18n; no tables/claude/clock/hasher/signer/random/logger/tts/fetch wiring changed).

## RED test list
- AC1: course-level language dropdown includes `el-GR`.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"CL-langs: course-level language dropdown includes Modern Greek (el-GR)"`
  - seams touched: none
  - edge cases: option present alongside existing la/grc
- AC2: side-language dropdowns include Greek with English label.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"CL-langs: side-language dropdowns include Modern Greek (en label)"`
  - seams touched: none
  - edge cases: both question + answer selects
- AC3: side-language dropdowns show the Dutch label under `lang=nl`.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"CL-langs: side-language dropdowns show Dutch label for Greek under lang=nl"`
  - seams touched: none
  - edge cases: locale switch
- AC4: PhotoImport language dropdowns include Greek.
  - test file: `frontend/src/screens/PhotoImport.test.jsx`
  - test name: `"PI-langs: language dropdowns include Modern Greek"`
  - seams touched: none
  - edge cases: dropdowns only render when courseLang set (use `courseLang: "fr-FR"`)

## Open questions / assumptions
- **Assumption:** course-level code is `el-GR` (region tag), matching the
  living-language pattern `fr-FR`/`nl-BE`/`en-GB`/`de-DE`; the per-side
  TTS code is bare `el`, matching `en`/`nl`/`fr`/`de`/`es`. `la`/`grc`
  used bare codes only because they have no region. Flagging in case you
  prefer bare `el` at the course level too.
- **Assumption:** English label "Greek", Dutch label "Grieks". (Reserving
  the unqualified word for the living language; `grc` keeps "Ancient
  Greek"/"Oudgrieks".)

## Risks
- Very low. Frontend-only, additive, no seam touched. Worst case a label
  wording tweak. Rollback = revert the list/i18n additions.

## Out-of-scope follow-ups
- Consolidate the three duplicated language arrays into one shared
  constants module (now three places to keep in sync).
- Consider a Modern-vs-Ancient hint in the extraction prompt if Claude
  ever confuses `el`/`grc` content.
