# Phase 17 — Visual polish pass (buttons, cards, inputs)

## Task
Add a reusable set of button / card / input / panel styles to `frontend/src/index.css` and apply them to the highest-traffic screens so the app stops reading as "all text, no hierarchy."

## Scope boundary

**IN**
- `frontend/src/index.css`: new utility classes — `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.card`, `.panel`, `.input`, `.field` (label + input wrapper), `.stack` (vertical rhythm), `.row` (horizontal rhythm), `.badge`.
- Hover / focus / active / disabled states for all button variants.
- Apply `.btn` + variant classes to primary action buttons in:
  - `UserPicker.jsx` (avatar picker → `.card` on each tile, `.btn-primary` on the login button).
  - `Login.jsx` (password form → `.input`, `.btn-primary`).
  - `Home.jsx` (main dashboard tiles → `.card`).
  - `Dashboard.jsx` (per-user summary → `.card`, `.btn` on CTAs).
  - `CourseList.jsx` (course tiles → `.card`, "New course" + row actions → `.btn-primary`/`.btn-ghost`).
  - `StudySession.jsx` ("Knew it" → `.btn-primary`, "Didn't know" → `.btn-secondary`, "Show answer" → `.btn-primary`).
  - `Settings.jsx` (save/logout → `.btn-primary`/`.btn-ghost`, inputs → `.input`).
- Typography: tighten heading hierarchy (`h1/h2/h3` spacing + weights), link color, section spacing.
- Dark-mode variants for all new utilities (reuse existing `--accent` / `--bg` / `--border` vars).

**OUT**
- Desktop sidebar nav / mobile-vs-desktop layout split. (That's option 3 from the earlier chat — a separate slice.)
- Tailwind / UnoCSS / any utility framework.
- Chart restyling beyond what already exists.
- Animations beyond simple CSS transitions (`transform`, `background`, `box-shadow`).
- New components or new prop APIs.
- Any markup change beyond adding `className` attributes.
- AdminPanel, CompareView, stats screens, PhotoImport, ImportReview, Leaderboard, SessionResults, CardManager, FamilyDashboard, CourseStats, UserStats — these keep their existing markup and just inherit the new base styles (link/heading/section). No per-screen className edits. They can be polished in a later slice if still ugly.

## Files to create / touch
- `frontend/src/index.css` (modify — bulk of the slice)
- `frontend/src/screens/UserPicker.jsx` (classNames)
- `frontend/src/screens/Login.jsx` (classNames)
- `frontend/src/screens/Home.jsx` (classNames)
- `frontend/src/screens/Dashboard.jsx` (classNames)
- `frontend/src/screens/CourseList.jsx` (classNames)
- `frontend/src/screens/StudySession.jsx` (classNames)
- `frontend/src/screens/Settings.jsx` (classNames)
- Matching test files only if existing assertions break from text reflow. Expected: no semantic changes, all current tests still pass.

## Seams involved
`none`. Pure CSS + className edits. No new data flow, no new props, no new API calls.

## RED test list
Visual polish is hard to meaningfully unit-test; coverage here is via screenshot (manual in browser). We add a small number of **assertable** tests that force us to actually apply the classes (not just define them), plus the full existing frontend suite must stay green.

- AC1: `UserPicker` renders each avatar tile with `.card` class.
  - test file: `frontend/src/screens/UserPicker.test.jsx`
  - test name: `"renders each user tile with .card class"`
  - seams touched: none
  - edge cases: empty list (no tiles) — test still passes trivially
- AC2: `Login` renders the submit button with `.btn-primary` and the password input with `.input`.
  - test file: `frontend/src/screens/Login.test.jsx`
  - test name: `"submit button uses .btn-primary and password input uses .input"`
  - seams touched: none
  - edge cases: disabled state during submit
- AC3: `StudySession` renders the "Knew it" action with `.btn-primary` and "Didn't know" with `.btn-secondary` in ANSWER phase.
  - test file: `frontend/src/screens/StudySession.test.jsx`
  - test name: `"grade buttons in ANSWER phase use .btn-primary and .btn-secondary"`
  - seams touched: none
- AC4: `CourseList` renders course tiles with `.card` and the "New course" CTA with `.btn-primary`.
  - test file: `frontend/src/screens/CourseList.test.jsx`
  - test name: `"course tiles use .card and New course button uses .btn-primary"`
  - seams touched: none
- AC5: Every existing test still passes unchanged (regression guard).
  - not a new test — verified by running the full frontend suite.

No coverage-threshold concerns: we're only adding className attributes to already-covered files, and the four new class-presence assertions are in already-covered test files.

## Open questions / assumptions

1. **Assumption**: The existing `--accent: #aa3bff` (purple) is the primary color. All `.btn-primary` uses it. If you want a different family palette (e.g. a warmer orange for "Knew it" and a cooler blue for "Didn't know") I'll change the variables, not the class structure — let me know.
2. **Assumption**: `.btn-primary` for the POSITIVE action ("Knew it"), `.btn-secondary` for the NEGATIVE ("Didn't know"). If you want semantic green/red on study grades that's easy to add, but it also risks making the app feel like a quiz/exam — I'd rather keep it neutral. Flag if you disagree.
3. **Assumption**: No changes to dark mode palette; the new utilities reuse the existing variables so dark mode "just works."
4. **Question**: Should `.card` have a subtle hover lift (`translateY(-2px)` + shadow) on pointer devices? Default: yes, behind `@media (hover: hover)` so touch devices don't get stuck-hover issues.

## Risks

- **Test breakage from DOM reflow**: unlikely (we're only adding classes), but a test that asserts precise whitespace around text could flake. Mitigation: run the full suite after each screen's edit, revert that screen's change if a test goes red that wasn't planned for.
- **Dark-mode regressions**: new color rules need to work in both light and dark. Mitigation: eyeball both after the CSS pass — dark mode is toggled in Settings.
- **Bundle size**: adding ~150–200 lines of CSS is a rounding error; no risk.
- **Mobile tap targets**: Phase 17 already ensured minimum 44px hit areas. `.btn` min-height will be 44px to preserve this. If it breaks something, revert to 40px.

## Out-of-scope follow-ups

- **Desktop-first layout** (option 3 from chat): sidebar nav at ≥768 px, 3-column dashboard grid, wider content. Separate slice.
- Restyle AdminPanel, stats, and import screens once the base utilities are proven.
- Consider CSS variable tokens for radius / spacing / shadow so later changes are one-line edits.
- Consider a tiny icon set (Lucide? Heroicons?) for bottom nav and action buttons — currently all-text labels.
- Visual regression testing (Playwright screenshot) as a CI guard once the look stabilizes.
