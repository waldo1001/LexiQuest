---
phase: 4
slice: 1
name: strings.js + useT hook + AppContext
status: proposed
---

# Phase 4 · Slice 1 — i18n foundation (strings, useT, AppContext)

## 1. Task

Introduce the i18n plumbing — a static `strings.js` (EN + NL), a
`useT` hook, and an `AppContext` provider that holds `{user, lang,
setLang, setUser}` — and rewire the Phase 3 screens to render all
user-visible text through `t('key', params)`.

## 2. Scope boundary

**IN**

- `frontend/src/i18n/strings.js` — `strings` object keyed by
  `lang → key → template`, plus a pure `translate(lang, key, params)`
  helper that interpolates `{name}`-style placeholders and falls
  back to EN if a key is missing in the target language.
- `frontend/src/i18n/useT.js` — React hook returning a `t(key, params)`
  function bound to the current context `lang`.
- `frontend/src/context/AppContext.jsx` — `AppProvider` + `useAppContext`.
  Holds `{user, setUser, lang, setLang}`. `setLang` updates local
  state only this slice (no API call — Slice 2 adds PATCH /api/me).
  `initialLang` / `initialUser` props accepted for tests and for
  wrapping the real app. Default `lang = 'en'`.
- `frontend/src/App.jsx` — wrap routes in `<AppProvider>`.
- Rewire `UserPicker`, `Login`, `Home` to use `useT()` for every
  user-visible string; no behavior change.
- ~25 i18n keys covering: picker, login, home, common (loading,
  save, cancel…), errors.

**OUT (deferred)**

- `PATCH /api/me` endpoint + `setLang` issuing the PATCH. → Slice 2.
- Settings screen + language toggle UI. → Slice 3.
- `document.documentElement.lang` reactive sync. → Slice 3 (it's
  meaningless without a toggle).
- Bootstrapping lang from `/api/me` on app start. → Slice 2, after
  the PATCH endpoint and a coherent me-sync strategy land together.
- Route guards based on `user` in context. → Phase 5.

## 3. Files to create / touch

Create:

- `frontend/src/i18n/strings.js`
- `frontend/src/i18n/strings.test.js`
- `frontend/src/i18n/useT.js`
- `frontend/src/i18n/useT.test.jsx`
- `frontend/src/context/AppContext.jsx`
- `frontend/src/context/AppContext.test.jsx`

Touch:

- `frontend/src/App.jsx` — wrap in `<AppProvider>`.
- `frontend/src/App.test.jsx` — still green (stubbed fetch).
- `frontend/src/screens/UserPicker.jsx` + `.test.jsx`
- `frontend/src/screens/Login.jsx` + `.test.jsx`
- `frontend/src/screens/Home.jsx` + `.test.jsx`
- `frontend/vitest.config.js` — add Tier A (90%) threshold entries
  for `src/i18n/strings.js`, `src/i18n/useT.js`, and
  `src/context/AppContext.jsx` (lib-equivalent files).

## 4. Seams

`none` at the API surface this slice — the context is pure React
state. (`fetch` seam already exists via `api.js` but isn't exercised
by any new code here.)

## 5. RED test list

`strings.js` (Tier A, 90%):

- **S1** `translate('en', 'picker.title')` returns `"Who are you?"`.
- **S2** `translate('nl', 'picker.title')` returns `"Wie ben jij?"`.
- **S3** `translate('en', 'home.greeting', { name: 'Lex' })` returns
  `"Hello, Lex"` (placeholder interpolation).
- **S4** `translate('nl', 'home.greeting', { name: 'Lex' })` returns
  `"Hallo, Lex"`.
- **S5** Unknown key returns the key itself (`'missing.key'`)
  — surface the bug, don't hide it.
- **S6** Key present in EN but missing in NL falls back to EN.
- **S7** `strings.en` and `strings.nl` share the same key set (meta-
  test: iterate keys, symmetric-difference must be empty).

`useT.js` (Tier A, 90%):

- **T1** Hook returns a function; calling `t('picker.title')` under a
  provider with `lang='en'` returns the EN string.
- **T2** Same hook under `lang='nl'` returns the NL string.
- **T3** Re-renders when `setLang` changes the context value (use a
  test component that reads `t('picker.title')` after clicking a
  button that flips lang).

`AppContext.jsx` (Tier A, 90%):

- **C1** `useAppContext` throws `"useAppContext must be used within an
  AppProvider"` when not wrapped.
- **C2** `AppProvider` defaults `lang` to `'en'` when no
  `initialLang` prop.
- **C3** `AppProvider` uses `initialLang` prop when supplied.
- **C4** `setLang('nl')` updates the context value.
- **C5** `setUser({...})` updates the context value.

Screen rewires (Tier B, 70%):

- **U3** `UserPicker` renders Dutch heading `"Wie ben jij?"` under
  `<AppProvider initialLang="nl">`.
- **U4** `UserPicker` error state renders the localized error
  (NL variant) when fetch fails under Dutch.
- **L3** `Login` password label + submit button + error reflect NL
  under Dutch provider.
- **H3** `Home` greeting renders `"Hallo, Lex"` under Dutch provider
  (confirms interpolation in a real screen).
- **H4** `Home` logout button text flips to Dutch under Dutch
  provider.
- Regression: existing English tests stay green (they wrap in
  `<AppProvider>` with default lang — English).

App shell:

- Existing `App.test.jsx` (EN "Who are you?") stays green, proving
  the default-lang wiring is correct end-to-end.

## 6. Open questions / assumptions

- **Assumption**: ~25 keys is enough for Phase 3 surface + common
  shell (buttons, errors, loading). Future slices extend the dict.
- **Assumption**: Interpolation syntax is `{name}` (curly braces, no
  escaping needed — no user-authored template strings). Simple
  `String.prototype.replace` is sufficient.
- **Assumption**: Fallback to EN on missing NL key is preferable to
  returning the raw key. Missing-key (not in EN either) returns the
  key so the developer sees it in the UI.
- **Assumption**: No `Intl.PluralRules`, no date/number formatting
  this slice — strings only. Plurals can come in later if needed.
- **Assumption**: Context is not persisted to localStorage — the
  source of truth is the user row in Table Storage (Slice 2+).

## 7. Risks

- **React 19 + `useContext` hook tests**: must render provider above
  the component using `useT`/`useAppContext`. Tests use
  `<AppProvider initialLang="…">` as a wrapper.
- **Snapshot churn**: no snapshots today; we use role/text queries,
  which switch cleanly between languages.
- **Key drift**: S7's EN↔NL key-set parity test prevents silent
  missing translations.

## 8. Out-of-scope follow-ups

- Slice 2 — `PATCH /api/me` endpoint + `setLang` wiring it up.
- Slice 3 — Settings screen language toggle + `<html lang>` sync.
- Future — FR/DE/ES language bundles; plural rules; ICU format.
- Future — bootstrapping lang from `/api/me` at app start.
