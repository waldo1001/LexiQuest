# LexiQuest

A personal, AI-powered gamified learning platform for the Wauters family.
Students (Lex, Mats, Ben) study course material using flashcards with spaced
repetition, gamification, and AI-assisted card creation from photos. The app
name is dynamic: LexiQuest / MatsQuest / BenQuest / WaldoQuest, based on who
is logged in.

**Status**: Phase 1 in progress — `frontend/` (Vite + React JS + Vitest)
and `api/` (Azure Functions v4 TS + `hello/`) scaffolded. Next:
`staticwebapp.config.json` + GitHub Actions deploy workflow.

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

## Working in this repo

Every code change — feature, bug fix, refactor — follows the TDD cycle in
[docs/tdd/methodology.md](docs/tdd/methodology.md), gated by the
`/tdd-cycle` skill. That means: write the PLAN, wait for approval, FRAME,
write the RED tests first, scaffold, implement to GREEN, refactor, check
coverage, run `/security-scan`, run `/docs-update`, self-review.

Read [CLAUDE.md](CLAUDE.md) before making the first code change.
