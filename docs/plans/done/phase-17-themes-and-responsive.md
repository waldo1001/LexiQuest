# Phase 17 — Themes + responsive layout

## Task
Introduce user-selectable visual themes (persisted server-side in
`settings.theme`) and rewrite the layout so it scales from ~360 px phones up
to 1600 px desktops without ugly column rails.

## Scope boundary

**IN**
- **Theme system** — CSS variable blocks keyed by `[data-theme-name="X"]` on
  `<html>`, applied by `AppProvider` from `user.settings.theme`.
- **Three themes**:
  1. `classic` — cleaned-up version of today's look (purple on near-white / dark navy). Serves as default and demo of the token system.
  2. `playful` — warm coral primary, mint accent, rounded Nunito heading font, chunky 2 px bottom-shadow on buttons (Duolingo feel). Aimed at kids.
  3. `arcade` — dark-only. Deep indigo background, neon cyan primary, magenta accent, JetBrains Mono headings. Game-UI vibes. Dark-mode toggle is hidden / forced dark when arcade is active.
- **Dark mode stays orthogonal** for `classic` and `playful` — user can still pick system / light / dark. `arcade` overrides it.
- **Responsive layout rewrite**:
  - Kill `#root`'s 960 px fixed width + `border-inline` rail.
  - Content is edge-to-edge on mobile, max-width `clamp(320px, 92vw, 1120px)` on tablet+, centered.
  - Base padding scales via `clamp()`: tight on phone, generous on desktop.
  - Key grids (`.tile-grid`, `.home-actions`, `.course-grid`, `.dashboard-stats`) already use `auto-fit minmax(...)` — verified on both form factors.
  - `BottomNav` visible only below 720 px; a top/side nav row shown above.
  - Add one real breakpoint helper: `.hide-mobile` / `.hide-desktop`.
- **Settings screen**: new theme dropdown (above dark-mode), writes through `patchMe({ settings: { theme } })` like existing prefs.
- **Server-side**: extend `UserRow.settings` with `theme?: "classic" | "playful" | "arcade"`, extend `me.ts` PATCH whitelist to accept `theme`, add a `THEMES` set constant.
- **Font loading** — add a `<link rel="preconnect">` + single Google Fonts `<link>` for Nunito (playful) and JetBrains Mono (arcade). Fall-back fonts listed first. No npm package added.
- **Default theme**: new users default to `classic`. Existing seeded users get the default via the fallback in `AppContext`, no migration needed.

**OUT**
- Per-theme illustration sets, SVG mascots, icon packs. Keep emoji-as-icon.
- A fourth theme (`notebook`). Cut for scope; can be added later with the same pattern.
- Animated theme transitions. A hard swap is acceptable.
- Theme preview on the Settings dropdown (live preview on change is free because the variable block swaps immediately; we don't need a separate preview pane).
- Changing chart colors per theme. Charts use the same accent var and will inherit. Per-chart tuning later.
- New Storybook / visual-regression infra.
- AdminPanel restyle, PhotoImport/ImportReview detail tuning. They inherit via base styles only.

## Files to create / touch

- `frontend/src/index.css` — big rewrite. Tokens live at `:root`; themes live at `:root[data-theme-name="playful"]`, `:root[data-theme-name="arcade"]`. Base layout uses the tokens only.
- `frontend/src/index.html` — add Google Fonts `<link>` for Nunito + JetBrains Mono.
- `frontend/src/context/AppContext.jsx` — add `themeName` state, hydrate from `user.settings.theme`, expose `setThemeName`, apply `data-theme-name` to `documentElement`. Force `data-theme="dark"` when theme is `arcade`.
- `frontend/src/screens/Settings.jsx` — theme `<select>` bound to context, persisted via `patchMe`.
- `frontend/src/screens/Home.jsx` — populate context themeName from `me.settings.theme` (already populates `user` via setUser; themeName rides along).
- `frontend/src/i18n/strings.js` — add `settings.theme.*` keys in EN + NL.
- `api/src/shared/seed.ts` — extend `UserRow.settings` with `theme?`.
- `api/src/functions/me.ts` — add `THEMES` set + `settings.theme` branch in PATCH validator.
- `api/src/functions/me.test.ts` — two new cases (valid + invalid theme).
- `frontend/src/screens/Settings.test.jsx` — one new case (changing theme calls patchMe).
- `frontend/src/context/AppContext.test.jsx` — one new case (themeName applied to documentElement).

## Seams involved
`tables` (indirectly, via the UserRow shape), `clock` (none). Primarily client-side state + one new server-side whitelist branch.

## RED test list

- AC1: `/api/me` PATCH accepts `{ settings: { theme: "playful" } }` and returns the updated user with `settings.theme === "playful"`.
  - test file: `api/src/functions/me.test.ts`
  - test name: `"PATCH /me accepts valid theme and persists it"`
  - seams: tables
  - edge cases: unknown theme → 400
- AC2: `/api/me` PATCH rejects unknown theme with 400 `{ error: "invalid theme" }`.
  - test file: same
  - test name: `"PATCH /me rejects invalid theme with 400"`
  - edge cases: empty string, number, arbitrary string
- AC3: `AppProvider` applies `data-theme-name="X"` to `document.documentElement` when `themeName` is set.
  - test file: `frontend/src/context/AppContext.test.jsx`
  - test name: `"applies data-theme-name on documentElement when themeName is set"`
  - seams: none
  - edge cases: unknown/null themeName → attribute absent (fall back to default classic); explicit `classic` → attribute absent or `"classic"` (I'll pick: attribute set to the literal for easy debugging)
- AC4: `Settings` renders a theme selector; changing it calls `patchMe({ settings: { theme } })` and updates context.
  - test file: `frontend/src/screens/Settings.test.jsx`
  - test name: `"changing theme calls patchMe with settings.theme and updates context"`
  - seams: none
  - edge cases: network failure surfaces an error alert like other prefs.
- AC5: When `themeName === "arcade"`, `data-theme` is forced to `"dark"` regardless of the user's dark-mode preference.
  - test file: `frontend/src/context/AppContext.test.jsx`
  - test name: `"arcade theme forces data-theme='dark' on documentElement"`
  - edge cases: switching from arcade back to classic restores the user's previous `data-theme` value.

No new assertable tests for the visual appearance of each theme (CSS-only). Regression guard is the existing 422-test suite staying green.

Coverage: `AppContext.jsx` and `Settings.jsx` are already at 100/95+; new branches will need one test each to hit the coverage line. `me.ts` is at 100% — the new validator branch needs the two AC1/AC2 tests.

## Open questions / assumptions

1. **Assumption**: Three themes is the right number (not two, not five). Easier to justify differentiating them if each has a clear vibe. Flag if you'd rather ship with two (`classic` + one more) or want a specific fourth.
2. **Assumption**: Google Fonts CDN is acceptable. If you want to self-host the font files, it's +5 min of work (put them under `frontend/public/fonts/`). Zero dependencies either way.
3. **Assumption**: Arcade locks dark mode rather than exposing a half-broken "arcade light." Cleaner than trying to maintain a neon-on-cream variant.
4. **Assumption**: Responsive breakpoint at 720 px for mobile→desktop transition (hides `BottomNav`, switches to a top nav row). If you want it earlier (tablet-friendly) or later (phone-only bottom nav), tell me.
5. **Question**: Should the default theme for *new seeded users* stay `classic`, or default to `playful` so the first impression out-of-box is nicer? Default: `classic` (least-surprise).

## Risks

- **Test pollution**: setting `data-theme-name` on `documentElement` in one test can leak to others if not cleaned up. Mitigation: `beforeEach` / `afterEach` reset in the two new test files.
- **Font flash of unstyled text (FOUT)** on first paint: acceptable for a local-dev family app. Mitigation is `font-display: swap` which is already Google Fonts default.
- **Server-side whitelist drift**: adding `theme` to the validator but forgetting the `UserRow.settings` type. Mitigation: TypeScript build will fail if they drift, and we update both in the same slice.
- **Dark mode interaction with arcade**: user picks dark=light, switches to arcade (forced dark), switches back → we must restore their choice. Mitigation: AC5 covers this.
- **Visual regressions elsewhere**: we're rewriting `index.css`. The 418 + 4 polish tests assert DOM/class structure, not CSS. Biggest risk is a too-aggressive `*` reset breaking a specific chart or layout. Mitigation: keep the rewrite additive-ish, not a clean-sheet `*` reset.

## Out-of-scope follow-ups

- Fourth theme (`notebook` — warm off-white, serif headings).
- Theme preview thumbnails in Settings.
- Chart color palette per theme.
- Brand logo / mascot.
- Migration path if we ever rename a theme.
