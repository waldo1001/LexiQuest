# Plan — Online-only PWA (kid-installable on Android)

## Context

Phase 17 listed "PWA polish" as a goal but the current state is a
**half-built PWA**: `vite-plugin-pwa@1.2.0` is in
[frontend/package.json](../../frontend/package.json),
[vite.config.js](../../frontend/vite.config.js) configures `VitePWA`
with `autoUpdate`, [public/manifest.json](../../frontend/public/manifest.json)
exists with proper `display:standalone` + `theme_color:#2563eb`, and
[index.html](../../frontend/index.html) links the manifest and sets
Apple meta tags. Eight basic manifest tests pass in
[pwa.test.js](../../frontend/src/pwa.test.js).

But it doesn't actually install on Android right now, because:

1. **Icons don't exist.** `manifest.json` references
   `/icons/icon-192.png` and `/icons/icon-512.png` but
   [frontend/public/icons/](../../frontend/public/icons/) is missing.
   Chrome's installability heuristic requires both icons to load
   successfully — without them, no install banner appears.
2. **SWA could 404 the manifest.** The
   [staticwebapp.config.json](../../staticwebapp.config.json)
   `navigationFallback.exclude` list omits `.json` and `.webmanifest`
   extensions, so `GET /manifest.json` may be rewritten to
   `/index.html`. We need to verify and fix.
3. **No `apple-touch-icon`.** iOS doesn't read `manifest.json` icons —
   you need an explicit `<link rel="apple-touch-icon">` in `<head>` or
   the home-screen icon falls back to a screenshot of the page.
4. **Build artifact untested.** Tests only check the source manifest.
   Nothing verifies that `npm run build` actually produces a service
   worker (`sw.js` / `registerSW.js`) and a shipped manifest.
5. **SW registration in dev is silent.** `vite-plugin-pwa` defaults to
   `injectRegister: 'auto'`, which only injects in production builds.
   Fine — but worth confirming so we don't fight invisible cache during
   local development.

The user's intent: **kids install LexiQuest from the home screen of
their Android device, web deploys auto-update the app, no app-store
work.** Online-only — sessions need network, no IndexedDB queue.

## Task (one sentence)

Ship the missing icons, fix the SWA route exclusion, add iOS
fallback icon, and harden tests so the next build *actually* installs
on a real Android phone.

## Scope — IN

1. **Generate `icon-192.png` and `icon-512.png`** under
   [frontend/public/icons/](../../frontend/public/icons/). Two
   variants each:
   - `icon-192.png` (any) and `icon-192-maskable.png` (with 20% safe-zone padding for round Android icons)
   - `icon-512.png` (any) and `icon-512-maskable.png`
   Source: render from a script (PNG from canvas) OR from
   [frontend/public/favicon.svg](../../frontend/public/favicon.svg) via
   sharp/resvg. Committed PNGs — no on-the-fly generation.
2. **Update `manifest.json`** to use four explicit icon entries (split
   `purpose: "any"` from `purpose: "maskable"`; current
   `"any maskable"` works but maskable-aware Androids show better
   results with split entries).
3. **Add `apple-touch-icon` link** to
   [index.html](../../frontend/index.html) pointing at
   `/icons/icon-192.png` (iOS uses this for home-screen icons; the
   manifest is ignored by Safari).
4. **Fix SWA navigation fallback** — extend
   [staticwebapp.config.json](../../staticwebapp.config.json)
   `navigationFallback.exclude` to include `*.json`, `*.webmanifest`,
   and `/icons/*`. Also add an explicit MIME-type route for
   `/sw.js` if needed (Workbox generates `sw.js` at the root).
5. **Test additions** in
   [frontend/src/pwa.test.js](../../frontend/src/pwa.test.js):
   - PWA-9: every icon path in `manifest.json` resolves to a real file
     under `public/`.
   - PWA-10: at least one icon has `purpose: "maskable"`.
   - PWA-11: `index.html` contains an `apple-touch-icon` link.
   - PWA-12: `staticwebapp.config.json` excludes `*.json` and
     `*.webmanifest` from navigation fallback.
6. **Build smoke test** — new
   [frontend/src/__build__/pwa-build.test.js](../../frontend/src/__build__/pwa-build.test.js)
   that runs `npm run build` (skipped via `it.skipIf(env.CI === undefined)`
   in fast unit runs) and asserts:
   - PWA-B1: `dist/manifest.json` (or `manifest.webmanifest`) exists.
   - PWA-B2: `dist/sw.js` (or `dist/registerSW.js`) exists.
   - PWA-B3: `dist/icons/icon-192.png` and `dist/icons/icon-512.png` exist.
   *Marked `__build__/` so it's filtered out of the normal `vitest run`
   coverage pass — it's a slow integration check, not a unit test.*
7. **Local smoke** — extend
   [.claude/skills/local-smoke/SKILL.md](../../.claude/skills/local-smoke/SKILL.md)
   to add a `GET /manifest.json` 200 check and a `GET /icons/icon-192.png`
   200 check after `swa start`.

## Scope — OUT

- **Offline study sessions.** Workbox is configured with
  `runtimeCaching: []` for a reason — `/api/*` calls must hit the
  network so logins, attempts, and stats are never stale. Offline
  attempts queue + sync is its own future phase.
- **Custom install button (`beforeinstallprompt`).** Browsers handle
  this fine for v1. Add later if engagement metrics show it's needed.
- **iOS App Store / TWA Play Store packaging.** Separate plan once the
  PWA is solid in production.
- **Push notifications, background sync, share target, file handling,
  protocol handlers.** None of these are kid-installation requirements.
- **Splash screen tuning beyond manifest defaults.** Android generates
  one from `theme_color` + 512px icon — fine.
- **Web App Shortcuts** (`shortcuts` array in manifest). Nice-to-have,
  not a blocker.

## Files to touch

| File | Change |
|---|---|
| `frontend/scripts/icon-source/waldo.png` | **NEW** — 591×591 source mark, copied into repo |
| `frontend/scripts/generate-icons.mjs` | **NEW** — sharp-based generator |
| `frontend/public/icons/icon-192.png` | **NEW** — 192×192, "any" (transparent) |
| `frontend/public/icons/icon-192-maskable.png` | **NEW** — 192×192, white background, 80% safe zone |
| `frontend/public/icons/icon-512.png` | **NEW** — 512×512, "any" (transparent) |
| `frontend/public/icons/icon-512-maskable.png` | **NEW** — 512×512, white background, 80% safe zone |
| [frontend/public/manifest.json](../../frontend/public/manifest.json) | Split icons into 4 entries: 2× any, 2× maskable |
| [frontend/index.html](../../frontend/index.html) | Add `<link rel="apple-touch-icon" href="/icons/icon-192.png">` |
| [staticwebapp.config.json](../../staticwebapp.config.json) | `navigationFallback.exclude` add `/manifest.json`, `*.webmanifest`, `/icons/*` |
| [frontend/src/pwa.test.js](../../frontend/src/pwa.test.js) | Tests PWA-9..PWA-12 |
| `frontend/src/__build__/pwa-build.test.js` | **NEW** — PWA-B1..PWA-B3 |
| [.claude/skills/local-smoke/SKILL.md](../../.claude/skills/local-smoke/SKILL.md) | Two new probe lines |

No changes to `vite.config.js` (current config is correct), `App.jsx`,
or any `api/` code.

## Icon generation strategy

**Source**: the user's personal mark, copied into the repo from
`/Users/waldo/SourceCode/Community/waldo.BCTelemetryBuddy/packages/extension/images/waldo.png`
(591×591 RGBA PNG, two-tone blue figure on transparent background).
Committing it as
`frontend/scripts/icon-source/waldo.png` so the build is reproducible
and doesn't depend on a path outside this repo.

The favicon.svg in [public/favicon.svg](../../frontend/public/favicon.svg)
is left untouched for now — replacing it is a separate visual-polish
task that can land alongside or after this slice.

We render the four PNG variants from this single source via a one-shot
`frontend/scripts/generate-icons.mjs` using **`sharp`** (Node-native,
already widely used in the JS ecosystem, no headless browser needed).
The script:

1. Reads `scripts/icon-source/waldo.png`.
2. For each `(size ∈ {192, 512})`:
   - **`icon-${size}.png`** (`purpose: "any"`) — resize to `size×size`,
     preserve transparency. The mark already has comfortable margin so
     no padding is required for the "any" variant.
   - **`icon-${size}-maskable.png`** (`purpose: "maskable"`) — resize
     the source to `size × 0.8` (i.e. 80% of canvas, the maskable safe
     zone), composite onto a `size×size` solid white (`#ffffff`)
     background. White matches the manifest's
     `background_color: "#ffffff"` so the splash screen and home-icon
     mask are visually consistent.
3. Writes all four files into `frontend/public/icons/`.

The PNGs themselves are committed — the script is for future
re-renders if the mark changes. CI does not regenerate icons.

```
frontend/scripts/icon-source/waldo.png    # NEW — committed source mark
frontend/scripts/generate-icons.mjs       # NEW — sharp-based generator
frontend/package.json                     # devDep: sharp + "icons": "node scripts/generate-icons.mjs"
```

**Brand note**: this makes the LexiQuest home-screen icon visually the
"waldo" personal mark, not a LexiQuest-specific logo. Flagging because
the rest of the app's visual identity (theme color `#2563eb`, the
quill/scroll favicon) was LexiQuest-branded. That's the user's
explicit call — easy to swap later by replacing `icon-source/waldo.png`
and re-running `npm run icons`.

## RED test list

Tier B (frontend) — 70% coverage floor on `frontend/src/`. Tests are
declarative file-system / JSON checks, no React rendering needed.

In `frontend/src/pwa.test.js` (extend existing 8):

- **PWA-9**: every `icons[].src` in `manifest.json` resolves to an
  existing file under `frontend/public/`.
- **PWA-10**: `manifest.json` has at least one icon with
  `purpose: "maskable"` and at least one with `purpose: "any"`
  (separate entries, not the conflated `"any maskable"`).
- **PWA-11**: `index.html` contains exactly one
  `<link rel="apple-touch-icon" …>` whose `href` points at an existing
  file under `frontend/public/`.
- **PWA-12**: `staticwebapp.config.json` `navigationFallback.exclude`
  list contains both `/manifest.json` and a glob covering
  `/icons/*`.

In new `frontend/src/__build__/pwa-build.test.js`:

- **PWA-B1**: after `npm run build`, `frontend/dist/manifest.json` (or
  `manifest.webmanifest`) exists and parses as JSON with the same
  `name: "LexiQuest"`.
- **PWA-B2**: `frontend/dist/sw.js` (or `registerSW.js`) exists and is
  non-empty.
- **PWA-B3**: `frontend/dist/icons/icon-192.png` and
  `frontend/dist/icons/icon-512.png` both exist and are valid PNGs
  (magic bytes `89 50 4E 47`).

The build test runs the real Vite build via `execSync` — slow (~5s),
which is why it lives under `__build__/` and is excluded from the
default unit-coverage pass via a vitest config exclude.

## Verification

1. **Unit tests** — `cd frontend && npm test` → 12/12 PWA tests green;
   total suite still green.
2. **Build smoke** —
   `cd frontend && npx vitest run src/__build__/pwa-build.test.js`
   → 3/3 green; `dist/` contains manifest, SW, and both icons.
3. **Local-smoke skill** — run `/local-smoke`, confirm new
   `/manifest.json` and `/icons/icon-192.png` probes return 200.
4. **Real-device smoke** — after deploying to SWA via `/deploy-swa`,
   open Chrome on an Android phone, navigate to the live URL, wait for
   "Add LexiQuest to Home screen" (or Menu → Install app). Verify:
   - Icon appears on home screen with the 192px maskable variant.
   - Tap launches fullscreen, no URL bar.
   - Splash screen uses `#2563eb` background (or our chosen
     `background_color`).
   - Pull-to-refresh and back-gesture work.
   - Logging in as a kid still works (cookies persist across SW
     fetches).
5. **Real-device iOS smoke** (if available) — Safari → Share → Add to
   Home Screen. Verify the 192px icon shows up (not a screenshot).
   Tap launches in standalone mode.
6. **Update Lighthouse** — DevTools → Lighthouse → PWA category →
   should score "Installable" with no errors. Capture the report (or
   an annotation) in [docs/changelog.md](../../docs/changelog.md).
7. **Security scan** — `/security-scan` clean (no new logs/errors;
   icons are non-sensitive).
8. **Docs** — `/docs-update` to add a "Install on your phone"
   paragraph to [docs/user-guide.md](../../docs/user-guide.md) with
   short instructions for the kids.

## Risks / notes

- **Cache poisoning during dev**: with `autoUpdate` SW, an old SW from
  a previous run can serve stale assets locally. Mitigation: in dev,
  `vite-plugin-pwa` only registers in production builds (default), so
  `npm run dev` is safe. After any prod build smoke, manually clear
  via DevTools → Application → Service Workers → Unregister.
- **Icon copyright**: source mark is the user's own personal logo
  (copied from a sibling repo, also user-owned). No third-party
  clip-art. Safe to commit and ship.
- **Maskable safe zone**: maskable PNGs need a 20% padding margin so
  the round Android mask doesn't crop the brand. The script must
  scale-and-pad, not just resize. Not the same as a transparent-edge
  letterbox.
- **SWA YAML cache**: after editing `staticwebapp.config.json`, the
  SWA Functions runtime needs a redeploy to pick up the new exclusion
  list — don't expect `swa start` to reload it on the fly. The
  `/local-smoke` and live-deploy probes will catch this.
- **Test imports of `frontend/dist/`**: build test must run AFTER
  `npm run build` — easiest is `vi.beforeAll(() => execSync('npm run
  build'))`. Mark the file with `// @vitest-environment node` so the
  fs reads work without jsdom.
- **iOS still won't auto-prompt**: even with everything correct,
  Safari hides the "Add to Home Screen" UI behind the Share sheet.
  This is an Apple choice, not a bug. The kids' user-guide blurb
  needs a screenshot.
- **`apple-touch-icon` size**: 180×180 is the canonical size; 192×192
  works but iOS will downscale. If that bothers, render an extra
  `apple-touch-icon-180.png`. Out of scope for v1 — 192 is acceptable.
