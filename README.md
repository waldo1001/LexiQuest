# LexiQuest

A personal, AI-powered gamified learning platform for the Wauters family.
Students (Lex, Mats, Ben) study course material using flashcards with spaced
repetition, gamification, and AI-assisted card creation from photos. The app
name is dynamic: LexiQuest / MatsQuest / BenQuest / WaldoQuest, based on who
is logged in.

**Status**: All 17 phases complete + Phase 18 (Bidirectional cards) + Gaming mode. PWA installable on iOS/Android, bottom nav, swipe gestures in study, dark mode, data export (`GET /api/export` → JSON download), offline banner. Bidirectional cards: courses can auto-create reverse cards (Q↔A swapped, independent SM-2 schedules), with pairing UI and linked delete in Card Manager. Gaming mode: pre-session setup screen with game type picker (Classic/Boss Round/Speed Round/Review Blitz), card count limiter, smart priority scoring, XP multipliers, speed round timer. Also live: Leaderboard + Compare (Phase 16), Stats UI (Phase 15), full stats API (Phase 14), AI card import (Phase 12), MCQ mode (Phase 13), TTS (Phase 11), XP/streaks/badges (Phase 10), SM-2 (Phase 8). Tagged `phase-17-done`. See [Design.md §7](Design.md) for deferred v2 items.

## What it is

- Per-student, per-year, per-course flashcard study with SM-2 spaced
  repetition.
- Cards added manually, via photo (AI OCR + distractors), or via AI page
  interpretation — always with a mandatory Import Review step.
- Gamification: XP, streaks, daily goals, badges, freeze tokens.
- Full stats transparency across the family, graphed — every user can see
  every other user's usage. Raw attempt rows of others are never exposed;
  only aggregates.
- Dutch / English UI, BCP-47 per course for TTS.

## What it is NOT

- A teacher / classroom tool
- A real-time multiplayer game
- Offline-sync-capable (PWA shell caching only)
- A registration-based service — admin (Waldo) creates the 4 family
  accounts

## Stack (see [Design.md §4](Design.md))

| Layer | Technology |
|---|---|
| Frontend | React + Vite (JavaScript) |
| API | Azure Functions, Node 20 (TypeScript) |
| Storage | Azure Table Storage |
| Hosting | Azure Static Web Apps (free tier) |
| Auth | HMAC-signed HTTP-only session cookies |
| AI | Anthropic Claude |
| Charts | Recharts |

Target cost: ~€2 / month.

## Documentation map

- [Design.md](Design.md) — authoritative design + 17-phase implementation
  plan. Start here.
- [PROGRESS.md](PROGRESS.md) — current state of the 17 phases.
- [CLAUDE.md](CLAUDE.md) — how AI contributors work in this repo (TDD
  toolchain entry point).
- [docs/tdd/](docs/tdd/) — methodology, testability patterns,
  AI-maintainability rules, coverage policy.
- [docs/changelog.md](docs/changelog.md) — dated log of changes.
- [docs/setup.md](docs/setup.md) — local setup and Azure provisioning.
  Grows per phase.
- [docs/getting-started.md](docs/getting-started.md) — five-minute happy
  path for a new dev on this repo.
- [docs/user-guide.md](docs/user-guide.md) — how family members use the
  running app.
- [.claude/skills/](.claude/skills/) — repo-local skills: `/tdd-cycle`,
  `/security-scan`, `/docs-update`, `/local-smoke`, `/deploy-swa`.
- [testing/](testing/) — drop-in Vitest configs + example seam fakes to
  copy into `api/` and `frontend/` at Phase 1.

## Local development

Prerequisites: Node 20+ (tested on 24), npm 10+, and — for the full
stack — the Azure Static Web Apps CLI
(`npm install -g @azure/static-web-apps-cli`).

```sh
# Frontend only (Vite dev server at http://localhost:5173)
cd frontend
npm install
npm run dev
npm test           # Vitest + coverage

# API only (unit tests, typecheck, build — no Functions host needed)
cd api
npm install
npm test
npm run typecheck
npm run build      # emits api/dist

# Full stack (Azure SWA emulator; needs swa CLI + Azure Functions Core
# Tools v4 for the api side). First shell:
cd frontend && npm run dev
# Second shell:
cd <repo-root>
swa start http://localhost:5173 --api-location api
# visit http://localhost:4280 — the SPA plus /api/hello routed through
# the SWA proxy.
```

See [docs/setup.md](docs/setup.md) for the authoritative setup
instructions and [docs/getting-started.md](docs/getting-started.md)
for the five-minute happy path.

## Working in this repo

Every code change — feature, bug fix, refactor — follows the TDD cycle in
[docs/tdd/methodology.md](docs/tdd/methodology.md), gated by the
`/tdd-cycle` skill. That means: write the PLAN, wait for approval, FRAME,
write the RED tests first, scaffold, implement to GREEN, refactor, check
coverage, run `/security-scan`, run `/docs-update`, self-review.

Read [CLAUDE.md](CLAUDE.md) before making the first code change.
