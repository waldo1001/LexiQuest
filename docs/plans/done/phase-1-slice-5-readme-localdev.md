---
phase: 1
slice: 5
name: README + local-dev instructions
status: proposed
---

# Phase 1 · Slice 5 — README + local-dev instructions

## 1. Task

Fill out the root `README.md` with an accurate stack summary and local
dev instructions covering the frontend, the api, and the `swa start`
full-stack proxy. Update `docs/setup.md` and `docs/getting-started.md`
with matching content. Note the manual `swa start` smoke as a Phase 1
gate that Waldo runs, not an automated test.

## 2. Scope boundary

**IN**

- README.md: stack summary already mostly correct — expand the
  "Working in this repo" section with exact commands for (a)
  `cd frontend && npm install && npm run dev`, (b)
  `cd api && npm install && npm run build`, (c) full-stack via
  `swa start` (prereq: Azure Static Web Apps CLI).
- docs/setup.md: add a "Full-stack local run" subsection pointing at
  `swa start --app-location frontend --api-location api --output-location frontend/dist --run "npm run dev --prefix frontend"`
  (one canonical command).
- docs/getting-started.md: slot the `swa start` command into the
  five-minute path.
- docs/changelog.md: one bullet.
- No new code, no new tests — this slice is purely docs. Therefore
  no RED list / coverage gate applies under methodology §2.1 (tests
  attach to behavior changes; pure docs have no behavior). Record
  that in the plan so future-me doesn't re-ask.

**OUT**

- Running `swa start` from inside this cycle (waldo runs the manual
  smoke; /local-smoke skill is wired but needs a terminal with
  interactive output).
- Azure portal provisioning writeup → belongs in a later
  operations-focused doc when the SWA is actually provisioned.
- Phase 2 `.env` / `local.settings.json` real values — introduced
  when the first seam needs them.

## 3. Files to touch

- `README.md`
- `docs/setup.md`
- `docs/getting-started.md`
- `docs/changelog.md`

## 4. Seams involved

`none`.

## 5. RED list

None — docs-only slice. Methodology §2.1: "If a requirement isn't on
the list, it won't get tested, and if it doesn't get tested it
doesn't get built." A docs change doesn't introduce a testable
behavior; there's nothing to encode as RED. The review-gate is visual
(`npm test` stays green in both subprojects, which is automatic).

## 6. Assumptions

- User has Azure Static Web Apps CLI globally installed
  (`npm install -g @azure/static-web-apps-cli`), or will install it
  on demand — documented in the README under prerequisites.
- `swa start` will succeed locally once started; no automated test
  here because /local-smoke is the dedicated smoke workflow.

## 7. Risks

- The README could drift from `docs/setup.md` / `docs/getting-started.md`;
  mitigation is to make the README link to those docs rather than
  duplicate more than the minimum.

## 8. Out-of-scope follow-ups

- Phase 1 smoke tag (`phase-1-done`) — apply after Waldo runs the
  manual `swa start` and confirms the browser shows "Hello from
  LexiQuest".
- Phase 2 introduces `.env` templates and the Azurite local-storage
  startup — setup.md will grow then.
