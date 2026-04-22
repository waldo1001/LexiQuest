---
phase: 1
slice: 1
name: frontend scaffold
status: proposed
---

# Phase 1 · Slice 1 — Scaffold `frontend/` (Vite + React JS)

## 1. Task

Scaffold the `frontend/` subproject as a Vite + React (JavaScript)
application wired to Vitest, producing a testable `App` component that
renders a "LexiQuest" heading.

## 2. Scope boundary

**IN this slice**

- `npm create vite@latest frontend -- --template react` scaffold
  (React 18+, JavaScript, not TypeScript — per Design.md §4.1).
- Merge `testing/frontend.package.deps.json` into
  `frontend/package.json` (dev-deps + scripts: `test`, `test:watch`,
  `dev`, `build`, `preview`).
- Copy `testing/vitest.config.frontend.js` → `frontend/vitest.config.js`.
- Create `frontend/src/testing/setup.js` (jest-dom import only).
- Replace the Vite demo `App.jsx` with a minimal component that renders
  the text **"LexiQuest"** inside an `<h1>` and nothing else
  interactive. (Styling stays at Vite defaults for now; polish is
  Phase 17.)
- One Vitest unit test for the `App` component (the RED driver for this
  slice).
- `frontend/.gitignore` additions if Vite's default misses anything
  relevant (node_modules, dist, coverage, .vite).

**OUT of this slice (explicitly deferred)**

- `api/` scaffold → Slice 2.
- `staticwebapp.config.json` + GitHub Actions deploy → Slice 3.
- `fetch('/api/hello')` wiring → Slice 4.
- `README.md` / local-dev docs → Slice 5.
- Dynamic `[Name]Quest` title (depends on auth) → Phase 3.
- i18n (`useT`, NL/EN toggle) → Phase 4.
- Routing (`react-router`) → first introduced whenever a second screen
  lands (Phase 3 at the earliest).
- Any global CSS beyond Vite's scaffolded default.

## 3. Files to create / touch

**Create**

- `frontend/` (entire Vite scaffold, committed)
- `frontend/vitest.config.js` (copied from `testing/`)
- `frontend/src/testing/setup.js`
- `frontend/src/App.test.jsx`

**Touch**

- `frontend/package.json` — merge scripts + devDependencies.
- `frontend/src/App.jsx` — replace Vite demo with minimal LexiQuest
  shell.
- `frontend/src/App.css` — clear or minimize demo styling (optional;
  defer if it risks scope creep).
- `frontend/.gitignore` — confirm `coverage/` is ignored.
- Root `.gitignore` — add `frontend/node_modules`, `frontend/dist`,
  `frontend/coverage` if not already covered.

No files under `api/` are touched in this slice.

## 4. Seams involved

`none` — no API calls, no storage, no clock, no Claude. This slice
is pure UI scaffolding + one render-smoke test.

## 5. RED test list

Single-AC slice; the scaffold itself is the delivery and the test
validates the scaffold is *testable*.

- **AC1**: The `App` component renders a visible "LexiQuest" heading.
  - test file: `frontend/src/App.test.jsx`
  - test name: `"renders a LexiQuest heading"`
  - seams touched: `none`
  - edge cases: none (render-only smoke); a deliberately thin RED
    because the real value is proving the toolchain works end-to-end
    (jsdom + react-testing-library + vitest + coverage gate).

Any additional assertions (e.g. `document.documentElement.lang`) are
deferred to Phase 4 where i18n actually sets it.

## 6. Open questions / assumptions

- **Assumption**: Vite React JavaScript template is the current
  `@latest` default (React 18+). If `create-vite` emits a different
  React major, the RED test still works (it only asserts on rendered
  text).
- **Assumption**: no opinion on CSS framework in this slice —
  Tailwind / CSS modules can be introduced in a later, scoped slice
  if needed. Design.md does not mandate one.
- **Assumption**: Node 20 is already the local default
  (Design.md §4.1 names it for the API; frontend tooling is
  compatible).
- **Assumption**: the root `.gitignore` is fine as-is for any
  subproject `node_modules/` / `dist/` / `coverage/` — I'll verify
  during scaffolding and only edit if needed.
- **Question for user**: commit the Vite-generated `public/vite.svg`
  and `src/assets/react.svg` as-is, or strip them? Default assumption
  unless you say otherwise: **keep them** (zero-cost; Phase 17 polish
  will replace branding).

## 7. Risks

- `npm create vite@latest` is interactive by default; running
  non-interactively via the documented `--template react` positional
  form avoids the prompt, but if the CLI behaviour has shifted I may
  need to pass `-y` or answer prompts once. Mitigation: run inside a
  shell with flags that force non-interactive.
- Coverage gate may fail on the first `npm test` because the scaffold
  file `src/main.jsx` is excluded, but `src/App.jsx` must hit ≥70% and
  branches aren't enforced — a single render test covers the whole
  (stateless) `App`. If it doesn't, I'll add one more test rather
  than weaken the threshold.
- `npm install` may pull a large dependency tree; not a correctness
  risk, just time. No rollback implications.
- **Rollback**: if Vite scaffold misbehaves, `rm -rf frontend/` and
  start over — no other part of the repo depends on it yet.

## 8. Out-of-scope follow-ups

- Slice 2: scaffold `api/` (Azure Functions, TypeScript, `hello/`
  function).
- Slice 3: `staticwebapp.config.json` + GitHub Actions deploy
  workflow.
- Slice 4: `fetch('/api/hello')` in `App.jsx`, render the `msg` field
  from the JSON.
- Slice 5: root `README.md` with stack summary + local-dev
  instructions + first manual `swa start` smoke.
- Phase 3+: introduce routing, AppContext, UserPicker — at which
  point `App.jsx` becomes a router shell rather than a single heading.
- Phase 4: `useT` + `<html lang>` reactive binding.
- Phase 17: replace Vite demo assets with LexiQuest branding; PWA
  manifest + service worker.
