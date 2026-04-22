---
phase: 1
slice: 3
name: swa config + github actions deploy
status: proposed
---

# Phase 1 · Slice 3 — `staticwebapp.config.json` + GitHub Actions deploy

## 1. Task

Add the `staticwebapp.config.json` routing config (SPA fallback, `/api/*`
passthrough) and the Azure Static Web Apps deploy workflow under
`.github/workflows/` so a push to `main` auto-deploys the frontend +
API bundle to SWA.

## 2. Scope boundary

**IN**

- `staticwebapp.config.json` at repo root:
  - `navigationFallback`: serve `/index.html` for all non-asset routes.
  - `routes`: let `/api/*` pass through to the Azure Functions.
  - `mimeTypes` if needed for `.svg` (usually default is fine).
- `.github/workflows/azure-static-web-apps.yml`:
  - Triggers on `push` to `main` + PRs targeting `main`.
  - Uses `Azure/static-web-apps-deploy@v1`.
  - `app_location: "frontend"`, `api_location: "api"`,
    `output_location: "dist"`.
  - Reads `AZURE_STATIC_WEB_APPS_API_TOKEN` from secrets.
  - Node 20 setup step.
- Unit test (JS) that parses `staticwebapp.config.json` and asserts
  the two routing rules (SPA fallback + `/api/*` passthrough). Lives
  under `frontend/src/lib/swaConfig.test.js` — hand-rolled fixture
  test, not a Function-host integration test.
- `frontend/src/lib/swaConfig.js` — thin helper that reads the JSON
  and exposes the two rules as named values. Gives us something with
  a 90% (Tier A) coverage floor.

**OUT**

- Azure portal provisioning (user action, flagged in the plan).
- `AZURE_STATIC_WEB_APPS_API_TOKEN` secret in the GitHub repo (user
  action).
- The frontend actually *fetching* `/api/hello` → Slice 4.
- Any custom CSP/header policy → Phase 17.

## 3. Files to create / touch

- `staticwebapp.config.json` (new)
- `.github/workflows/azure-static-web-apps.yml` (new)
- `frontend/src/lib/swaConfig.js` (new)
- `frontend/src/lib/swaConfig.test.js` (new)

## 4. Seams involved

`none` — this slice is config files + a helper that reads the repo-root
JSON via Vite's `import ... assert { type: "json" }`. No API seams, no
storage.

## 5. RED test list

- **AC1**: `readSwaConfig()` returns an object with `navigationFallback.rewrite = "/index.html"`.
  - test file: `frontend/src/lib/swaConfig.test.js`
  - test name: `"exposes SPA fallback rewriting to index.html"`
  - seams: `none`
  - edge cases: none (config is static)
- **AC2**: `readSwaConfig()` includes a route where `route` is `/api/*`
  and `rewrite` (or passthrough) is unset → proves the `/api/*` path
  is not intercepted by the SPA fallback.
  - test file: `frontend/src/lib/swaConfig.test.js`
  - test name: `"leaves /api/* requests to the Functions runtime"`
  - seams: `none`

## 6. Open questions / assumptions

- **Assumption**: SPA fallback via `navigationFallback.rewrite` is the
  current SWA recommended shape (it is per 2026 SWA docs).
- **Assumption**: the frontend build output lives in `frontend/dist`
  (Vite default) — matches `output_location` in the workflow.
- **Assumption**: `api_location: "api"` — Azure's Oryx builder runs
  `npm install` + `npm run build` there. Our `api/package.json`
  already has `build: tsc`.
- **User action (not Claude's to do)**: provision the Azure Static
  Web App in the portal, link the GitHub repo + `main` branch. That
  step creates the `AZURE_STATIC_WEB_APPS_API_TOKEN` GitHub secret.
  Without it, the workflow will fail on the `azure_static_web_apps_api_token`
  input — expected until Waldo provisions the SWA.

## 7. Risks

- The Oryx build for the api location may not pick up the TypeScript
  `build` script automatically on every Node version — if deploy
  fails, we'll add `api_build_command: "npm run build"` to the
  workflow in a follow-up slice.
- ESLint / Vitest config in `frontend/` might reject importing JSON
  from the repo root (outside `frontend/`). Mitigation: copy the
  relevant fragments into a small JS module rather than importing the
  raw JSON (and keep the JSON as the source of truth for SWA itself).
  The helper re-declares the two rules and the test asserts both the
  JSON on disk and the helper agree.

## 8. Out-of-scope follow-ups

- Slice 4: frontend fetches `/api/hello`.
- Slice 5: README stack summary + local-dev + first manual `swa start`.
- Phase 3+: add `/api/login`, `/api/me`, `/api/users/public` routes
  — revisit routing rules in `staticwebapp.config.json` to
  require auth on protected routes (via SWA's `allowedRoles` if we
  use them, or via the handler's `requireAuth` middleware).
- Phase 17: CSP/header policy on `staticwebapp.config.json`.
