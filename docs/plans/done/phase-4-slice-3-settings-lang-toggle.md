# Plan — Phase 4 Slice 3: Settings screen language toggle + `<html lang>` sync

## 1. Task
Add a Settings screen with a language toggle (EN / NL), wire it into the
app router, and reactively keep `document.documentElement.lang` in sync
whenever the active language changes.

## 2. Scope boundary

**IN**
- `<html lang="...">` synced via `useEffect` in `AppProvider` on every
  `lang` change (including on mount).
- `Settings.jsx` screen: shows current language, lets the user switch, calls
  `setLang(lang)` from `AppContext`, surfaces a save-error message when the
  PATCH call fails.
- `/settings` route registered in `App.jsx`.
- "Settings" navigation link/button added to `Home.jsx`.
- All new strings already present in `strings.js` (`settings.title`,
  `settings.language`, `settings.language.en`, `settings.language.nl`).

**OUT** (deferred)
- Settings for anything other than `ui_language` (those are Phase 10+).
- Authentication guard on `/settings` (Phase 5 route-guard slice).
- Back-navigation logic beyond a simple link to `/home`.

## 3. Files to create / touch

| File | Action |
|---|---|
| `frontend/src/context/AppContext.jsx` | add `useEffect` for `<html lang>` sync |
| `frontend/src/context/AppContext.test.jsx` | add 2 tests for lang sync |
| `frontend/src/screens/Settings.jsx` | **create** |
| `frontend/src/screens/Settings.test.jsx` | **create** |
| `frontend/src/App.jsx` | add `/settings` route |
| `frontend/src/App.test.jsx` | add 1 test that `/settings` renders Settings |
| `frontend/src/screens/Home.jsx` | add Settings link |
| `frontend/src/screens/Home.test.jsx` | add 1 test for the Settings link |

## 4. Seams involved

- `fetch` (via injected `patchMe` in `AppProvider`) — already wired in Slice 2.
- None new.

## 5. RED test list

### AppContext — `<html lang>` sync

- **AC1**: On mount with `initialLang="en"`, `document.documentElement.lang`
  is set to `"en"`.
  - test file: `frontend/src/context/AppContext.test.jsx`
  - test name: `"sets document.documentElement.lang to initialLang on mount"`
  - seams: none
  - edge cases: default lang is "en"

- **AC2**: After `setLang("nl")` resolves, `document.documentElement.lang`
  updates to `"nl"`.
  - test file: `frontend/src/context/AppContext.test.jsx`
  - test name: `"updates document.documentElement.lang when lang changes"`
  - seams: `patchMe` mock (resolves)
  - edge cases: no update when patchMe rejects (already covered by existing
    test — `<html lang>` stays at "en")

### Settings screen

- **AC3**: Renders a heading with the `settings.title` string.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"renders the settings heading"`
  - seams: none
  - edge cases: en and nl headings

- **AC4**: The select/radio for the current language has the current lang
  pre-selected.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"pre-selects the current language"`
  - seams: none
  - edge cases: "en" pre-selected when lang="en"; "nl" when lang="nl"

- **AC5**: Selecting a different language option calls `setLang` with the
  new value.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"calls setLang when the user picks a different language"`
  - seams: `setLang` spy from AppContext
  - edge cases: does not call setLang when same lang re-selected

- **AC6**: When `setLang` rejects, an error message is shown.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"shows an error message when setLang fails"`
  - seams: `patchMe` mock (rejects)
  - edge cases: error is cleared if save succeeds later (optional/AC7)

- **AC7**: Has a "Back" link navigating to `/home`.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"has a back link to /home"`
  - seams: none
  - edge cases: none

### App routing

- **AC8**: Navigating to `/settings` renders the Settings screen.
  - test file: `frontend/src/App.test.jsx`
  - test name: `"renders the Settings screen at /settings"`
  - seams: `fetch` stub
  - edge cases: none

### Home navigation

- **AC9**: Home renders a link or button that navigates to `/settings`.
  - test file: `frontend/src/screens/Home.test.jsx`
  - test name: `"renders a link to the settings screen"`
  - seams: `fetchMe` mock
  - edge cases: none

## 6. Open questions / assumptions

- **Assumption**: The language picker uses a `<select>` element — simple,
  accessible, no extra UI library.
- **Assumption**: The language list is the two values already in
  `strings.js` (`en`, `nl`). Future languages just add entries there.
- **Assumption**: Change is applied on `<select onChange>` (immediate, no
  explicit Save button), matching the server-first pattern already in
  `AppContext.setLang` (PATCH then update state).
- **Assumption**: A saving spinner is not required for this slice; an error
  message on failure is sufficient.
- **Question (flagged)**: Should the Settings screen be accessible without
  being logged in? For now, treating it as reachable — route guard comes in
  Phase 5.

## 7. Risks

- jsdom may have quirks with `document.documentElement.lang`; mitigated by
  checking the attribute directly in tests.
- `afterEach` cleanup of `document.documentElement.lang` needed in
  AppContext tests to avoid pollution between test runs.

## 8. Out-of-scope follow-ups

- Route guard (redirect to `/` if not authenticated) — Phase 5 Slice 4.
- Other settings fields (`auto_speak`, daily goal, etc.) — Phase 10–11.
- Animated language switch transition.
