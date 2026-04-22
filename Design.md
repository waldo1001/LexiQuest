# LexiQuest — Application Design Document

**Version**: 0.2 (Phased, build-ready)
**Author**: Waldo
**Date**: April 2026
**Status**: Ready for implementation

---

## 0. How to read this document

This doc is structured for a coding agent to work through **phase by phase**. Each phase is:

- **Independently shippable** — after finishing a phase, you have a working app you can use
- **Smoke-testable** — every phase has an explicit "Done when.." checklist
- **Self-contained** — you can stop between phases without breaking anything

Workflow per phase:

1. Read sections 1–5 for context (one-time)
2. Open the current phase in section 6+
3. Complete all tasks
4. Run the smoke test
5. Commit, tag `phase-N-done`, move on

Sections 1–5 are **authoritative references** — phases point back to them rather than redefining things. If you spot a conflict between a phase and a reference section, the reference wins (and the phase should be fixed).

---

## 1. Overview

LexiQuest is a personal, AI-powered gamified learning platform for the Wauters family. Students (Lex, Mats, Ben) study course material using flashcard sessions with spaced repetition, gamification, and AI-assisted card creation from photos.

The app name is dynamic: **[Name]Quest** based on the logged-in user (LexiQuest, MatsQuest, BenQuest, WaldoQuest).

### Goals

- Personal, structured study environment per student, scoped to school year and courses
- Cards added manually, via photo (AI OCR + distractors), or via AI page interpretation
- Spaced repetition learning engine (SM-2) with gamification (streaks, XP, leaderboard)
- **Full transparency: every user can see every other user's detailed usage — visualized with graphs**
- Admin (Waldo) can manage users, reset passwords, manage years
- Simple, cheap-to-run stack (target: < €2/month)
- UI available in Dutch and English

### Non-goals (v1)

- Real-time multiplayer / challenges
- Teacher accounts / external sharing
- Email notifications
- Native mobile apps (PWA covers this)
- Markdown / rich text in card content
- Offline sync (PWA shell caching only)

---

## 2. Users & Roles

| Role | Users | Capabilities |
|---|---|---|
| **Admin** | Waldo | Everything below + manage users, reset passwords, manage school years |
| **Student** | Lex, Mats, Ben | Own courses and cards, study sessions, **view detailed stats and graphs for every user in the family** |

No registration. Admin creates users. Login is avatar tap + password.

**Stats visibility rule:** detailed usage data (sessions, accuracy, XP history, course-level breakdowns, activity heatmaps) is **visible to all family members by default**. This is a feature, not a leak — it fuels healthy competition and shared accountability. Only password hashes and user settings are private.

---

## 3. Data Model (authoritative)

### 3.1 Entity overview

```
Users
  └── Courses (scoped to a Year)
        └── Cards
              └── Attempts
Years (global, shared across users)
Sessions (per user, per course)
```

### 3.2 Entities

#### `users`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | string | Display name, e.g. "Lex" |
| password_hash | string | bcrypt |
| is_admin | boolean | Waldo only |
| color | string | Hex for avatar |
| avatar_emoji | string | e.g. 🦊 |
| ui_language | enum | `'nl'` \| `'en'`, default `'nl'` |
| settings | JSON | `{ auto_speak: bool, preferred_mode: enum, daily_goal: int }` |
| created_at | datetime | |

#### `years`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| label | string | e.g. "2025-2026" |
| is_current | boolean | Only one active |
| start_date | date | Sept 1 |
| end_date | date | June 30 |

#### `courses`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users |
| year_id | UUID | FK → years |
| name | string | e.g. "French" |
| emoji | string | e.g. 🇫🇷 |
| color | string | Accent color |
| language | string? | BCP-47: `'fr-FR'`, `'nl-BE'`, `'en-GB'`, or null |
| default_mode | enum | `'self_grade'` \| `'mcq'` \| `'mixed'` \| `'ask'` — default `'ask'` |
| created_at | datetime | |

#### `cards`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| course_id | UUID | FK → courses |
| question | string | Front |
| answer | string | Back — supports `\|`-separated alternatives (e.g. `le chien\|le chiot`) |
| distractors | string[] | Optional, 2 wrong answers for MCQ. Empty = MCQ falls back to self-grade. |
| hint | string? | Optional, in user's UI language at creation time |
| source | enum | `'manual'` \| `'photo'` \| `'ai_import'` |
| sm2_ease | float | SM-2 easiness factor, default 2.5 |
| sm2_interval | int | Days until next review, default 0 |
| sm2_reps | int | Consecutive correct reps, default 0 |
| next_review_at | datetime | Scheduled review time |
| created_at | datetime | |

#### `attempts`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| card_id | UUID | FK → cards |
| user_id | UUID | FK → users |
| session_id | UUID | FK → sessions |
| correct | boolean | |
| mode | enum | `'self_grade'` \| `'mcq'` |
| response_time_ms | int | |
| timestamp | datetime | |

#### `sessions`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | |
| course_id | UUID | |
| mode | enum | Session-level mode |
| started_at | datetime | |
| ended_at | datetime? | Null while active |
| cards_studied | int | |
| cards_correct | int | |
| xp_earned | int | |
| duration_seconds | int | Derived on close — useful for stats |

### 3.3 Storage choice

**Azure Table Storage** (not Cosmos DB).

Rationale: tiny data volume (~15k rows lifetime max), simple query patterns, genuinely free at this scale, no free-tier quirks.

**Partition strategy:**

| Table | Partition key | Row key |
|---|---|---|
| `users` | `'users'` | id |
| `years` | `'years'` | id |
| `courses` | `user_id` | id |
| `cards` | `course_id` | id |
| `attempts` | `user_id` | `{iso_timestamp}_{id}` (enables date-range queries) |
| `sessions` | `user_id` | `{iso_started_at}_{id}` |

Complex fields (`distractors`, `settings`) stored as JSON strings.

---

## 4. Architecture

### 4.1 Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React + Vite | Fast, well-understood, good mobile |
| **Charts** | Recharts | Small, React-native, covers 100% of needed chart types |
| **Hosting** | Azure Static Web Apps (Free tier) | CDN, GitHub Actions, bundled Functions |
| **API** | Azure Functions (Node.js 20) | Serverless, free tier, scales to zero |
| **Database** | Azure Table Storage | Effectively free, flexible enough |
| **Auth** | HMAC-signed HTTP-only session cookies | Simpler & safer than localStorage JWT |
| **AI** | Anthropic Claude API (claude-sonnet-4) | Photo OCR + cards + distractors in one call |
| **Images** | Base64 in-flight only (no blob storage) | One less moving part |

### 4.2 Architecture diagram

```
┌─────────────────────────────────────────────────────┐
│            BROWSER / MOBILE (PWA)                   │
│   React SPA served via Azure Static Web Apps CDN    │
│   - Avatar picker / login                           │
│   - Course nav / study session / card manager       │
│   - Stats & graphs (every user visible to everyone) │
│   - i18n (NL / EN)                                  │
│   - speechSynthesis for language courses            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + HTTP-only session cookie
┌──────────────────────▼──────────────────────────────┐
│           AZURE FUNCTIONS (/api/*)                  │
│   Auth middleware on every non-login route          │
│   Stats aggregation endpoints                       │
│   Claude API integration for import + enrich        │
└────────┬──────────────────────────┬─────────────────┘
         │                          │
┌────────▼────────┐    ┌────────────▼────────────────┐
│  Azure Table    │    │     Anthropic Claude API    │
│  Storage        │    │  - Photo → cards+distractors│
│                 │    │  - Page → cards+distractors │
│  users, years,  │    │  - Batch enrich distractors │
│  courses, cards,│    └─────────────────────────────┘
│  attempts,      │
│  sessions       │
└─────────────────┘
```

### 4.3 Deployment

- GitHub repo: `waldo1001/lexiquest`
- `main` → Azure Static Web Apps via GitHub Actions (auto)
- Env vars in Azure SWA application settings:
  - `STORAGE_CONNECTION_STRING`
  - `ANTHROPIC_API_KEY`
  - `SESSION_SECRET` (for signing cookies)

### 4.4 Cost estimate

| Resource | Free tier | Expected |
|---|---|---|
| Azure Static Web Apps | Free | €0 |
| Azure Functions (Consumption) | 1M calls/month free | €0 |
| Azure Table Storage | First 10GB + cheap transactions | < €0.05 |
| Anthropic Claude API | Pay per use | < €2 |
| **Total** | | **~€2/month** |

---

## 5. Cross-cutting concerns (authoritative)

### 5.1 Authentication

**Flow:**
1. Avatar picker → password prompt
2. `POST /api/login { userId, password }`
3. bcrypt.compare → sign HMAC-SHA256 token `{ userId, isAdmin, exp: 30d }`
4. Set HTTP-only, Secure, SameSite=Lax cookie
5. Middleware validates on every protected request

**Why not full JWT?** For a family app, signed session cookies are simpler, safer (HTTP-only = no XSS token theft), and don't need a refresh dance.

**Authorization rules:**

| Resource | Read | Write |
|---|---|---|
| Own user record | self, admin | self (limited fields), admin (all) |
| Other users' user records | — | admin only |
| Own courses/cards/attempts/sessions | self, admin | self, admin |
| **Other users' courses/cards/attempts/sessions** | **all authenticated users (read-only)** | admin only |
| Stats / leaderboard / graphs | all authenticated users | system |
| Years | all | admin only |

> The "everyone sees everyone" rule applies to **stats data**. Raw card content (questions/answers) is also visible across users — this is fine for a family and avoids a permissions rabbit hole. Admin password reset is the only truly privileged action.

### 5.2 i18n

**Implementation:** Plain JSON dictionary + React Context hook. No library.

```
src/i18n/strings.js   — { en: {...}, nl: {...} }
src/i18n/useT.js      — useT() → (key) => string
```

- `ui_language` stored per user in DB + AppContext
- `<html lang="...">` updated dynamically
- Dates via `Intl.DateTimeFormat(lang)`
- App name `[Name]Quest` language-agnostic

**Translated:** all UI chrome, buttons, labels, gamification terms, errors
**Not translated:** card content, course names, user names

**Claude prompts:** kept in English (more predictable), but instructed to generate hints in UI language and distractors in course language.

### 5.3 Spaced repetition: SM-2

Two-button grading (Knew it / Didn't know) maps to quality 5 / 0. MCQ: correct = 5, wrong = 0.

```
if quality < 3:
    reps = 0
    interval = 1  # review tomorrow
else:
    if reps == 0:     interval = 1
    elif reps == 1:   interval = 6
    else:             interval = round(interval * ease)
    reps += 1

ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
next_review_at = now + interval days
```

New card defaults: `ease=2.5, interval=0, reps=0, next_review_at=now`.

### 5.4 Session modes

| Mode | Grading | Needs distractors |
|---|---|---|
| `self_grade` | User taps Knew / Didn't know | No |
| `mcq` | Auto-graded (3 buttons) | Yes (falls back per-card if missing) |
| `mixed` | Randomly per card | Uses MCQ where available |

Course has `default_mode`. User can override at session start. `ask` = always ask per session.

### 5.5 Study session state machine

```
1. Build queue:
   - due cards (next_review_at <= now)
   - + up to N new cards (reps == 0 AND never attempted)
   - N capped by remaining daily goal
   - shuffle
2. For each card:
   - show question (+ 🔊 if course.language set)
   - IF mode resolves to MCQ AND card has distractors:
     - 3 shuffled buttons → immediate grade
     - reveal correct if wrong; auto-🔊 if auto_speak on
   - ELSE:
     - "Show answer" → reveal (+ 🔊 if auto_speak)
     - Knew it / Didn't know (shown ONLY after reveal)
   - log attempt, run SM-2, persist
   - wrong → retry pile
3. Drain retry pile (self-grade only, 0 XP for retries)
4. End session: compute XP, close session row, show results
```

### 5.6 AI integration (Claude)

**One call per import** — photo or page generates question + answer + 2 distractors in a single pass. Base64 image straight from browser → API → Claude. No blob storage.

**Import prompt (paraphrased):**
```
You are extracting study cards from a student's study material.
For each learnable item, return:
- question: the prompt side
- answer: the correct response (use | for valid alternatives)
- distractors: exactly 2 plausible-but-wrong alternatives
    * same type/category as the answer
    * plausibly wrong, never a valid synonym
    * never equal to the answer

Context:
- Course name: {course_name}
- Course language (if set): {course_language}
- User UI language: {ui_language}

Return JSON only:
[{"question":"...","answer":"...","distractors":["...","..."]}]
```

**Batch enrich prompt** (for manually-added cards missing distractors):
```
For each Q/A, generate 2 plausible-but-wrong distractors of the same
type as the answer. Return JSON:
[{"id":"...","distractors":["...","..."]}]
```

**Review & confirm is always mandatory** — no "trust and import all" path. A memorized wrong card is worse than no card.

### 5.7 Gamification

| Action | XP |
|---|---|
| Correct first try | 10 |
| Correct after retry | 0 |
| Complete session | +20 |
| Perfect session (100% first-try) | +30 |
| Daily goal reached | +25 |
| Boss round complete | +50 |

- Levels: `level_n_xp = n * 200`
- Streak: 1+ session/day, breaks at local midnight
- Freeze tokens: earn 1 per 14-day streak, max 2 stored
- Daily goal: default 20 cards, per-user configurable

**Badges:**
| Badge | Trigger |
|---|---|
| 🔥 On Fire | 7-day streak |
| 💯 Perfectionist | Perfect session |
| 📸 Shutterbug | First photo import |
| 🧠 Big Brain | 50 cards at ease > 2.5 with reps > 5 |
| 👑 Boss Slayer | Boss round complete |
| 📚 Bookworm | 500 cards studied |

### 5.8 Stats & visibility (the "everyone sees everyone" feature)

This is a first-class feature of LexiQuest. Every logged-in user can browse detailed, graphed usage for any family member, including themselves. Design principles:

- **Default is open.** No "privacy toggle" in v1.
- **Graphs are the main view, not an afterthought.** Numbers in tables are secondary.
- **Cross-user comparison is built in.** Any chart should support 1 or N users overlaid.
- **Time ranges are first-class:** 7d / 30d / 90d / Year / All.
- **Drill-down:** family → user → course → card.

#### 5.8.1 Stats screens

| Screen | Scope | Purpose |
|---|---|---|
| **Family Dashboard** | All users | One-page overview: everyone's streak, XP this week, accuracy trend, activity heatmap — side-by-side |
| **User Stats** | One user | Deep dive: sessions, accuracy, XP history, time studied, per-course breakdown, badges earned, activity heatmap |
| **Course Stats** | One user + one course | Cards mastered over time, per-card struggle list, session history for that course |
| **Leaderboard** | All users | XP ranking — 7d / 30d / All time — plus secondary rankings (most accurate, longest streak, most sessions) |
| **Compare View** | 2+ users | Any two or more users overlaid on the same chart, pickable metric |

#### 5.8.2 Required graphs (minimum set)

All implemented with Recharts. All support date-range filter + user selector (single or multi).

| # | Chart | Type | Metric | X-axis | Notes |
|---|---|---|---|---|---|
| 1 | **XP over time** | Line | Cumulative XP | Day | Multi-user overlay |
| 2 | **Daily XP** | Bar | XP earned that day | Day | Stacked by course or per user |
| 3 | **Accuracy trend** | Line | % correct first try | Day / week | Smoothed 7-day rolling |
| 4 | **Sessions per day** | Bar | Session count | Day | Multi-user side-by-side |
| 5 | **Time studied** | Bar | `sum(duration_seconds)` | Day | Minutes displayed |
| 6 | **Activity heatmap** | Calendar heatmap | Cards studied | Day-of-year grid | GitHub-contrib style, one per user |
| 7 | **Mastery distribution** | Stacked bar | Cards per SM-2 interval bucket | Bucket (new, learning, young, mature, mastered) | Per course and per user |
| 8 | **Per-course activity** | Stacked area / bar | Cards studied split by course | Day/week | Per user |
| 9 | **Streak history** | Line + markers | Current streak length over time | Day | Markers for streak breaks & freezes used |
| 10 | **Card struggle list** | Horizontal bar (top N) | Fail count | Card | Per user+course; click → card detail |
| 11 | **Hour-of-day histogram** | Bar | Attempts | Hour (0–23) | "When do they study?" |
| 12 | **Response time distribution** | Histogram | Attempts | Response time bucket (ms) | Bonus insight |

#### 5.8.3 Mastery buckets (for chart 7)

| Bucket | Definition |
|---|---|
| New | `reps == 0` |
| Learning | `reps >= 1 AND sm2_interval < 7` |
| Young | `7 <= sm2_interval < 21` |
| Mature | `21 <= sm2_interval < 60` |
| Mastered | `sm2_interval >= 60` |

#### 5.8.4 Aggregation strategy

Stats endpoints aggregate on the server from `attempts` + `sessions` + `cards`. Given the data volume (max ~100 attempts/user/day, ~4 users → ~400 rows/day, ~150k rows/year), no pre-aggregation or materialized views are needed for v1.

Strategy:
- Query partition by `user_id`, filter by row-key prefix (which starts with ISO timestamp) for date ranges
- Compute in-memory in the Function
- Response shapes tailored to chart needs (time series, buckets, top-N)
- Add simple HTTP caching (`Cache-Control: private, max-age=60`) on stats endpoints to keep it snappy

#### 5.8.5 Privacy & safety note

Since stats are shared family-wide, we add one non-negotiable guardrail: **raw response times and individual attempt records of other users are NOT exposed via API** (only aggregates). This prevents weird micro-analysis patterns. If a user opens "Card struggle list" for another user, they see the card and the fail count — not per-attempt timestamps.

### 5.9 API endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login` | - | Set session cookie |
| POST | `/api/logout` | user | Clear cookie |
| GET | `/api/me` | user | Current user info |
| GET | `/api/users` | user | List all (every user sees every user — needed for stats) |
| POST | `/api/users` | admin | Create |
| PUT | `/api/users/:id` | admin | Update / reset password |
| GET | `/api/years` | user | List |
| POST | `/api/years` | admin | Create |
| PUT | `/api/years/:id` | admin | Update / set current |
| GET | `/api/courses?userId=` | user | List — any user's (omit param = self) |
| POST | `/api/courses` | user | Create own |
| PUT | `/api/courses/:id` | user (owner or admin) | Update |
| DELETE | `/api/courses/:id` | user (owner or admin) | Delete |
| GET | `/api/cards?courseId=` | user | List (read-only for other users' cards) |
| POST | `/api/cards` | user (course owner or admin) | Create |
| PUT | `/api/cards/:id` | user (course owner or admin) | Update |
| DELETE | `/api/cards/:id` | user (course owner or admin) | Delete |
| POST | `/api/cards/import` | user (course owner or admin) | AI import with image (base64) |
| POST | `/api/cards/enrich` | user (course owner or admin) | Batch distractor gen |
| POST | `/api/sessions` | user | Start — returns queue |
| PUT | `/api/sessions/:id` | user | End — final stats |
| POST | `/api/attempts` | user | Log attempt (batch OK) |
| GET | `/api/stats/user/:userId?range=` | user | Aggregated stats for any user |
| GET | `/api/stats/course/:courseId?range=` | user | Course-level stats |
| GET | `/api/stats/family?range=` | user | All users side-by-side for dashboard |
| GET | `/api/stats/compare?userIds=&metric=&range=` | user | Multi-user overlay data |
| GET | `/api/stats/heatmap/:userId?range=` | user | Calendar heatmap data |
| GET | `/api/leaderboard?period=` | user | 7d / 30d / all-time rankings |

### 5.10 UI inventory

| Screen | Notes |
|---|---|
| User Picker | Avatar grid |
| Login | Password prompt after avatar tap |
| Dashboard | Own streak, XP, daily progress, courses, quick actions |
| Course List | Current year's courses |
| Course Detail | Cards, add/import, "Enrich MCQ" button |
| Card Manager | CRUD |
| Import Review | Mandatory confirm after AI extraction |
| Study Session | Flip UI, MCQ buttons, 🔊, progress |
| Session Results | XP, accuracy, mastered, badges |
| **Family Dashboard** | All users side-by-side (§5.8.1) |
| **User Stats** | Deep dive per user, any user viewable (§5.8.1) |
| **Course Stats** | Per user + course drill-down |
| **Compare View** | Overlay 2+ users on one chart |
| Leaderboard | 7d / 30d / All time + secondary rankings |
| Admin Panel | Users, years, password reset (Waldo only) |
| Settings | UI lang, auto-speak, daily goal, streak freeze |

### 5.11 Repository structure

```
lexiquest/
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── charts/          # Recharts wrappers, one per graph type
│   │   ├── i18n/
│   │   │   ├── strings.js
│   │   │   └── useT.js
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   ├── sm2.js
│   │   │   ├── xp.js
│   │   │   └── tts.js
│   │   ├── context/AppContext.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── api/
│   ├── login/ logout/ me/
│   ├── users/ years/ courses/ cards/
│   ├── cards-import/ cards-enrich/
│   ├── attempts/ sessions/
│   ├── stats-user/ stats-course/ stats-family/ stats-compare/ stats-heatmap/
│   ├── leaderboard/
│   └── shared/
│       ├── tables.js       # Table Storage client
│       ├── auth.js         # session cookie middleware
│       ├── claude.js       # Anthropic wrapper
│       ├── sm2.js          # server-side copy
│       └── aggregate.js    # stats aggregation helpers
├── scripts/
│   └── seed.js
├── .github/workflows/deploy.yml
├── staticwebapp.config.json
├── .env.example
└── README.md
```

---

# 6. PHASED IMPLEMENTATION PLAN

Each phase builds on the last. Don't skip ahead — every phase's smoke test depends on the previous ones. After each phase: commit + tag `phase-N-done`.

Phase summary:

| # | Phase | Outcome |
|---|---|---|
| 1 | Project skeleton & deploy pipeline | Empty app deployed to Azure |
| 2 | Storage layer & seed data | Tables + 4 seeded users |
| 3 | Authentication | Login/logout works end-to-end |
| 4 | i18n foundation | UI switches NL ↔ EN |
| 5 | Users & admin panel | Waldo can manage users & passwords |
| 6 | Years & Courses | Create/edit/delete courses per user |
| 7 | Manual cards (no AI yet) | CRUD cards, browse as any user |
| 8 | SM-2 scheduling & study session (self-grade) | Study works, schedule updates |
| 9 | Attempts & sessions logging | Data lands in storage, session results screen |
| 10 | XP, streaks, daily goals, badges | Gamification live on own dashboard |
| 11 | speechSynthesis / TTS | Language courses speak |
| 12 | Claude import: photo → cards + distractors | AI import flow end-to-end |
| 13 | MCQ mode & enrich endpoint | Multiple-choice sessions work |
| 14 | Stats API: aggregation engine | All `/api/stats/*` endpoints live |
| 15 | Stats UI: graphs & Family Dashboard | Every user can see everyone's usage, graphed |
| 16 | Leaderboard & Compare view | Rankings + multi-user overlay charts |
| 17 | PWA polish, settings, backup/export | Installable, exportable, production-ready |

---

## Phase 1 — Project skeleton & deployment pipeline

**Goal:** a deployable empty shell. Visiting the URL shows "Hello from LexiQuest" served from Azure.

### Tasks

1. Create GitHub repo `waldo1001/lexiquest`, proprietary license, Node `.gitignore`
2. Scaffold frontend with Vite + React (JavaScript, not TS — keep simple):
   ```
   npm create vite@latest frontend -- --template react
   ```
3. Scaffold `/api` with a single Azure Function `hello/` returning `{ msg: "Hello from LexiQuest" }`
4. Add `staticwebapp.config.json`: SPA fallback to `index.html`, `/api/*` passthrough
5. Create Azure Static Web App (portal or CLI), link GitHub `main`
6. Confirm auto-generated GitHub Actions workflow deploys successfully
7. Frontend fetches `/api/hello` on load, displays the message
8. Add `README.md` with stack summary + local dev instructions (`npm run dev` in frontend, `swa start` for full stack)

### Smoke test — Done when

- [ ] Deployed URL shows "Hello from LexiQuest"
- [ ] Devtools confirms `/api/hello` returned JSON
- [ ] A commit to `main` auto-deploys within ~5 min
- [ ] `npm run dev` works locally
- [ ] `swa start` (or equivalent) runs full stack locally

Commit + tag `phase-1-done`.

---

## Phase 2 — Storage layer & seed data

**Goal:** Table Storage provisioned, schema defined in code, seed script populates 4 users + current year.

### Tasks

1. Provision an Azure Storage account in the same resource group as the SWA
2. Add `STORAGE_CONNECTION_STRING` to SWA app settings + local `.env`
3. `cd api && npm install @azure/data-tables bcryptjs uuid`
4. Create `api/shared/tables.js`:
   - Client factory per table (`users`, `years`, `courses`, `cards`, `attempts`, `sessions`)
   - Helpers: `getById(table, pk, rk)`, `listByPartition(table, pk)`, `listByRowKeyRange(table, pk, from, to)`, `upsert(table, entity)`, `remove(table, pk, rk)`
   - On first call: auto-create table if missing (idempotent)
   - Helper: serialize/deserialize JSON fields (`settings`, `distractors`)
5. Create `scripts/seed.js`:
   - Creates 4 users: Waldo (admin), Lex, Mats, Ben with bcrypt-hashed passwords (read from `.env`, one var per user)
   - Creates current year `2025-2026`
   - Prints the user UUIDs
   - Idempotent (checks before insert)
6. Run seed locally, verify via Azure Storage Explorer

### Smoke test — Done when

- [ ] All 6 tables exist, visible in Storage Explorer
- [ ] `users` has 4 rows with bcrypt hashes (not plaintext)
- [ ] `years` has 1 row with `is_current = true`
- [ ] Re-running seed doesn't duplicate or error
- [ ] A quick test script can call `listByPartition('users', 'users')` and get 4 rows

Commit + tag `phase-2-done`.

---

## Phase 3 — Authentication (login + session)

**Goal:** users log in, receive an HTTP-only session cookie, and `GET /api/me` returns their info.

### Tasks

1. Create `api/shared/auth.js`:
   - `sign({ userId, isAdmin })` → HMAC-SHA256 token (Node `crypto`), 30-day exp baked into payload
   - `verify(token)` → payload or throws
   - `requireAuth(req)` middleware → reads `session` cookie, verifies, returns `{ userId, isAdmin }` or 401
   - `requireAdmin(req)` → `requireAuth` + isAdmin check
   - Helper: `setSessionCookie(res, token)` / `clearSessionCookie(res)` with correct flags
2. Implement `POST /api/login`:
   - Body `{ userId, password }`
   - Look up user, bcrypt.compare
   - On success: sign token, set cookie, return `{ id, name, isAdmin, ui_language }`
   - On failure: 401 with generic message
3. Implement `POST /api/logout`: clear cookie, return 204
4. Implement `GET /api/me`: return current user profile (requires auth)
5. Frontend — `screens/UserPicker.jsx`: fetch `/api/users` (public list of id+name+avatar only — **add a public endpoint `/api/users/public` for this, no auth required, returns only `{id, name, avatar_emoji, color}`**)
6. Frontend — `screens/Login.jsx`: password prompt, `POST /api/login`, navigate to `/home` on success
7. Frontend — `screens/Home.jsx`: calls `/api/me`, shows "Hello, {name}"; redirects to picker on 401
8. Frontend logout button → `POST /api/logout` → return to picker
9. Do **not** store anything in localStorage — rely on HTTP-only cookie

### Smoke test — Done when

- [ ] Picker lists 4 avatars via `/api/users/public`
- [ ] Picking Waldo + correct password → `/home` shows "Hello, Waldo"
- [ ] Wrong password → friendly error, stays on login
- [ ] Refresh on `/home` keeps you logged in (cookie persists)
- [ ] Logout → back to picker, visiting `/home` redirects back
- [ ] `GET /api/me` without cookie returns 401
- [ ] `document.cookie` in devtools does NOT reveal the session token (HTTP-only ✅)

Commit + tag `phase-3-done`.

---

## Phase 4 — i18n foundation

**Goal:** UI renders NL or EN based on user's `ui_language`. Settings toggle switches it.

### Tasks

1. Create `frontend/src/i18n/strings.js` — start with ~25 keys (picker, login, home, logout, errors, settings, common buttons)
2. Create `frontend/src/i18n/useT.js` hook consuming AppContext
3. Create `frontend/src/context/AppContext.jsx`:
   - Initialized from `/api/me`
   - Holds `{ user, lang, setLang }`
   - `setLang(lang)` → PATCH `/api/me { ui_language }` + update context
4. Backend: add `PATCH /api/me` allowing users to update their own `ui_language` and `settings`
5. Replace all hardcoded UI strings from Phase 3 with `t('key')`
6. Update `<html lang="...">` reactively via `useEffect` on lang change
7. Add a placeholder Settings screen with a language toggle
8. Persist lang choice across sessions (stored on user record, not local)

### Smoke test — Done when

- [ ] Waldo set to `nl` — all UI renders in Dutch
- [ ] Toggle in settings switches live to English without reload
- [ ] Refresh: language preference persists (came from DB)
- [ ] `document.documentElement.lang` reflects current language
- [ ] Other users retain their own language preferences independently

Commit + tag `phase-4-done`.

---

## Phase 5 — Users & admin panel

**Goal:** Waldo can create/edit/delete users and reset passwords. Non-admins get 403.

### Tasks

1. Backend:
   - `GET /api/users` (authenticated) → full list including `ui_language` and non-sensitive settings (no hashes)
   - `POST /api/users` (admin) → create with bcrypt-hashed password
   - `PUT /api/users/:id` (admin) → update any field; password optional (rehash if provided)
   - `DELETE /api/users/:id` (admin) → hard delete (cascade manually: delete their courses, cards, attempts, sessions)
2. Frontend — `screens/AdminPanel.jsx` (admin-only route, guarded):
   - Table of users with edit/delete buttons
   - "New user" modal: name, password, emoji, color, is_admin, ui_language
   - "Reset password" action: prompt + PUT
3. Route guard: if `user.is_admin === false`, redirect away from `/admin`

### Smoke test — Done when

- [ ] Waldo can create a new test user, log in as them, delete them
- [ ] Waldo can reset Lex's password and log in as Lex with the new one
- [ ] Lex visiting `/admin` gets redirected (not just error)
- [ ] Deleting a user with data (from later phases) cascades cleanly

Commit + tag `phase-5-done`.

---

## Phase 6 — Years & Courses

**Goal:** Each user has courses in the current year; full CRUD.

### Tasks

1. Backend `/api/years`:
   - `GET` (auth) → list
   - `POST` (admin) → create
   - `PUT /:id` (admin) → update, including "set current" (automatically unsets others)
2. Backend `/api/courses`:
   - `GET ?userId=` (auth) → courses for a user (defaults to self)
   - `POST` (auth) → create own course (server sets `user_id` from session, never trusts body)
   - `PUT /:id` (owner or admin) → update
   - `DELETE /:id` (owner or admin) → delete + cascade cards
3. Frontend:
   - `screens/CourseList.jsx` — grid of user's courses for current year
   - "New course" modal: name, emoji, color, language (dropdown: none/fr-FR/nl-BE/en-GB/de-DE/...), default_mode
   - Edit / delete per course
   - Admin year management in AdminPanel

### Smoke test — Done when

- [ ] Lex can create "French 🇫🇷" with language `fr-FR`
- [ ] Lex can edit it, delete it
- [ ] Lex cannot PUT/DELETE a course owned by Mats (403)
- [ ] Waldo CAN edit anyone's course (admin override)
- [ ] Current year propagates correctly (new courses linked to `is_current` year)

Commit + tag `phase-6-done`.

---

## Phase 7 — Manual cards (no AI yet)

**Goal:** CRUD cards per course. Browsing other users' cards is allowed (read-only).

### Tasks

1. Backend `/api/cards`:
   - `GET ?courseId=` (auth) → list cards for course (any user can read)
   - `POST` (course owner or admin) → create
   - `PUT /:id` (course owner or admin) → update
   - `DELETE /:id` (course owner or admin) → delete
   - Validate: `answer` can contain `|` for alternatives
   - On create: set SM-2 defaults (`ease=2.5, interval=0, reps=0, next_review_at=now`)
2. Frontend — `screens/CardManager.jsx`:
   - Table of cards with inline edit
   - "Add card" form: question, answer (with hint text "Use | for alternatives"), optional hint
   - Delete with confirm

### Smoke test — Done when

- [ ] Lex can add 10 cards to her French course
- [ ] Lex can edit/delete her own cards
- [ ] Lex viewing Mats's course cards: read-only (edit buttons hidden or 403 on attempt)
- [ ] Alternative-answer syntax stored verbatim (`le chien|le chiot`)
- [ ] New cards have correct SM-2 defaults and `next_review_at <= now`

Commit + tag `phase-7-done`.

---

## Phase 8 — SM-2 scheduling & study session (self-grade)

**Goal:** Self-grade study sessions work end-to-end. Card scheduling updates based on SM-2.

### Tasks

1. Create `api/shared/sm2.js` and mirror copy at `frontend/src/lib/sm2.js`:
   - `applySm2(card, quality) → { ease, interval, reps, next_review_at }`
2. Backend `POST /api/sessions`:
   - Body: `{ courseId, mode }`
   - Build queue: cards where `next_review_at <= now` + up to N new cards (N = remaining daily goal, see Phase 10 for real implementation — for now, hardcode N=20)
   - Shuffle, return `{ sessionId, cards: [...] }`
   - Insert session row with `ended_at = null`
3. Backend `POST /api/attempts`:
   - Body: batch of `{ cardId, correct, mode, response_time_ms }` + `sessionId`
   - For each: log attempt, recalc SM-2 on card, upsert card
4. Backend `PUT /api/sessions/:id`:
   - Close session: set `ended_at`, compute `cards_studied`, `cards_correct`, `duration_seconds`
5. Frontend — `screens/StudySession.jsx`:
   - Fetches queue from `/api/sessions`
   - Card flip UI (CSS 3D transform)
   - "Show answer" → reveal → "Knew it" / "Didn't know" buttons (only after reveal)
   - Wrong → retry pile at end (self-grade only)
   - On card graded, queue attempt locally
   - On session complete, batch POST attempts + PUT close session
   - Navigate to `SessionResults.jsx` (placeholder for now — Phase 9 fleshes it out)

### Smoke test — Done when

- [ ] Lex starts a session with 10 cards
- [ ] Can flip, self-grade each
- [ ] Wrong cards appear again at the end
- [ ] After session, card SM-2 fields updated in storage (verify in Storage Explorer)
- [ ] Failed cards have `reps=0, interval=1, next_review_at = tomorrow`
- [ ] Correct cards have `reps=1, interval=1` (on first success)

Commit + tag `phase-8-done`.

---

## Phase 9 — Attempts & sessions logging + results screen

**Goal:** Raw attempts logged for stats. Session results screen shows the session summary.

### Tasks

1. Verify from Phase 8: attempts persist with correct timestamps, session rows close properly
2. Add row-key format `{ISO_timestamp}_{uuid}` for attempts and sessions (so date-range queries work later)
3. Frontend — `screens/SessionResults.jsx`:
   - Shows: cards studied, cards correct, accuracy %, time taken
   - XP placeholder ("+0 XP for now" — Phase 10 wires XP)
   - "Back to course" / "Study again" buttons
4. Backend: add a simple `GET /api/stats/session/:id` returning the closed session row — used by results screen

### Smoke test — Done when

- [ ] Finishing a session shows a results screen with accurate counts
- [ ] Attempts table grows by exactly N rows per session of N cards (plus retries)
- [ ] Session row has non-null `ended_at`, `cards_studied`, `cards_correct`
- [ ] Row keys are ISO-timestamp-prefixed (verified in Storage Explorer)

Commit + tag `phase-9-done`.

---

## Phase 10 — XP, streaks, daily goals, badges

**Goal:** Gamification live. Home dashboard shows own streak + XP + daily progress.

### Tasks

1. Create `frontend/src/lib/xp.js` + `api/shared/xp.js` (keep both in sync):
   - `computeSessionXp(session, attempts) → int` per XP table in §5.7
   - `checkBadges(user, newState) → Badge[]`
2. Backend: on session close (PUT /api/sessions/:id):
   - Compute XP from session + its attempts
   - Update session row's `xp_earned`
   - Determine streak: check if user had a session yesterday or earlier today; update streak counter (stored in `users.settings.streak` — or a dedicated field)
   - Check daily goal: `cards_studied` today (sum across sessions) vs `settings.daily_goal`
   - Award badges if earned (store in `users.settings.badges: string[]`)
   - Return enriched response for frontend results screen
3. Frontend:
   - `screens/Dashboard.jsx`: streak 🔥, total XP, level, daily goal progress bar, "Start study" per course
   - Session results screen shows XP breakdown + newly earned badges
4. Midnight rollover: handled on read (derive "streak broken" by comparing last session date to today in user's timezone — which for this family is always Europe/Brussels)
5. Settings: editable `daily_goal` (default 20)
6. Freeze token: award 1 per 14-day streak milestone, max 2 stored in settings; auto-spend on a missed day before breaking streak

### Smoke test — Done when

- [ ] Completing a 10-card all-correct session awards expected XP (100 + 20 session bonus + 30 perfect = 150)
- [ ] Dashboard shows streak = 1 after first day, 2 after second
- [ ] Skipping a day breaks the streak (unless a freeze is available)
- [ ] Hitting daily goal adds +25 XP bonus once per day only
- [ ] Badges appear in settings + on results screen when earned

Commit + tag `phase-10-done`.

---

## Phase 11 — speechSynthesis / TTS

**Goal:** Language courses speak. Tap 🔊 on the question or answer to hear it pronounced.

### Tasks

1. Create `frontend/src/lib/tts.js`:
   - `speak(text, lang, rate = 0.9)` — wraps `SpeechSynthesisUtterance`
   - Handles browser quirks (some engines require `voices` populated; retry with delay if empty)
   - Exposes `isAvailable(lang)` → boolean
2. Study session UI:
   - If `course.language` set: show 🔊 button next to question
   - After answer reveal: show 🔊 next to answer too
   - If `settings.auto_speak`: auto-speak question on show, answer on reveal
3. Card manager: 🔊 button in card list for language courses (to verify pronunciation on add)
4. Settings: `auto_speak` toggle (default off)
5. Gracefully hide 🔊 on devices where `speechSynthesis` is unavailable for that language

### Smoke test — Done when

- [ ] French course with `language='fr-FR'`: 🔊 speaks in French
- [ ] Dutch course (`nl-BE`): 🔊 speaks in Dutch
- [ ] No-language course: no 🔊 button appears
- [ ] `auto_speak` on: question auto-plays on show, answer on reveal
- [ ] Works on iOS Safari, Chrome desktop, Chrome Android (accept minor voice-quality differences)

Commit + tag `phase-11-done`.

---

## Phase 12 — Claude import: photo → cards + distractors

**Goal:** Take a photo of a vocab sheet, get back structured cards with distractors, review, confirm, save.

### Tasks

1. Add `ANTHROPIC_API_KEY` to SWA app settings
2. `cd api && npm install @anthropic-ai/sdk`
3. Create `api/shared/claude.js`:
   - Wrapper that takes base64 image + prompt + JSON schema expectation
   - Uses `claude-sonnet-4` (or latest stable model name at time of implementation — verify in docs)
   - Returns parsed JSON or throws
4. Implement `POST /api/cards/import`:
   - Auth: course owner or admin
   - Body: `{ courseId, imageBase64, mode: 'photo'|'page' }`
   - Fetch course (needs name, language, user's ui_language for prompt)
   - Call Claude with prompt from §5.6
   - Strip any markdown fences, parse JSON
   - Return card candidates (do NOT save yet)
5. Frontend — `components/PhotoImport.jsx`:
   - `<input type="file" accept="image/*" capture="environment">` → FileReader → base64
   - Show loading spinner while Claude processes (5–15s)
   - On response, navigate to Import Review screen
6. Frontend — `screens/ImportReview.jsx`:
   - List of card candidates with editable question/answer/distractors
   - Per-card checkbox (default: checked)
   - "Save selected" → `POST /api/cards` for each (or a new batch endpoint — see task 7)
7. Backend: `POST /api/cards/batch` for batch create (for efficiency on large imports)
8. Error handling: Claude fails → friendly error on review screen

### Smoke test — Done when

- [ ] Photo of a vocab sheet → Claude returns cards with distractors
- [ ] Review screen shows extracted Q/A with distractors pre-filled
- [ ] User can edit a card, uncheck a card, save the rest
- [ ] Saved cards appear in CardManager with `source='photo'` and populated `distractors`
- [ ] Bad photo (blank paper) → friendly "No cards extracted" message, not a crash
- [ ] Non-owner trying to import to someone else's course → 403

Commit + tag `phase-12-done`.

---

## Phase 13 — MCQ mode & enrich endpoint

**Goal:** Study sessions can run in MCQ mode. Manually-added cards can be enriched with distractors on demand.

### Tasks

1. Backend `POST /api/cards/enrich`:
   - Auth: course owner or admin
   - Body: `{ courseId }`
   - Fetch all cards in course with empty `distractors`
   - Single Claude call with the batch enrich prompt (§5.6)
   - Parse response, update cards
   - Return count enriched
2. Frontend: on Course Detail, "Enrich MCQ" button:
   - Only visible if course has cards missing distractors
   - Click → loading → toast "Enriched N cards"
3. Session start UI — mode picker:
   - If `course.default_mode === 'ask'`, show mode selector before session
   - Options: Self-grade / Multiple choice / Mixed
4. Study session MCQ rendering:
   - If card has distractors AND resolved mode != self_grade: show 3 shuffled buttons
   - Correct = green flash, wrong = red flash + reveal correct
   - Auto-grade, log attempt with `mode='mcq'`
   - No retry pile for MCQ (immediate feedback is enough)
5. Mixed mode: per card, random choice between MCQ (if distractors present) and self-grade

### Smoke test — Done when

- [ ] Starting a session with `mode=mcq` on a course with distractors shows 3-option buttons
- [ ] Tapping correct = green, wrong = red + correct revealed
- [ ] Card missing distractors + mcq mode → falls back to self-grade for that card only
- [ ] "Enrich MCQ" button populates distractors via one API call
- [ ] Attempts logged with correct `mode` value

Commit + tag `phase-13-done`.

---

## Phase 14 — Stats API: aggregation engine

**Goal:** All `/api/stats/*` endpoints from §5.9 return correctly-shaped data. No UI yet.

### Tasks

1. Create `api/shared/aggregate.js` with pure helpers:
   - `fetchAttempts(userId, from, to)` — uses row-key range query on attempts partition
   - `fetchSessions(userId, from, to)` — same on sessions
   - `fetchCards(userId)` — joins via courses
   - `groupByDay(items, dateFn)` — bucket into daily series
   - `rollingAverage(series, window)` — for smoothed accuracy
   - `masteryBucket(card)` → `'new'|'learning'|'young'|'mature'|'mastered'` per §5.8.3
2. Implement endpoints:
   - `GET /api/stats/user/:userId?range=7d|30d|90d|1y|all`
     Returns: `{ totalXp, level, currentStreak, longestStreak, totalCardsStudied, totalSessions, totalMinutes, accuracyTrend: [{date, pctFirstTry}], xpOverTime: [{date, cumulativeXp}], dailyXp: [{date, xp}], sessionsPerDay: [{date, count}], timeStudiedPerDay: [{date, minutes}], hourOfDay: [{hour, attempts}], responseTimeBuckets: [{bucket, count}], masteryDistribution: {new, learning, young, mature, mastered}, badgesEarned: [...] }`
   - `GET /api/stats/course/:courseId?range=` — same shape but scoped to course, plus `cardStruggleList: [{cardId, question, failCount}]` (top 20)
   - `GET /api/stats/family?range=` — compact shape, one row per user: `{ userId, name, color, avatar, xp, streak, accuracy, sessionsLastN, cardsLastN }`
   - `GET /api/stats/compare?userIds=a,b,c&metric=xp|accuracy|sessions|cards|minutes&range=` — `[{date, userId_a: value, userId_b: value, ...}]`
   - `GET /api/stats/heatmap/:userId?range=` — `[{date, count}]` for calendar heatmap
3. Add `Cache-Control: private, max-age=60` headers on all stats endpoints
4. **Privacy guardrail (§5.8.5):** endpoints return aggregates only — never individual attempt rows of other users. The `/api/attempts` endpoint stays self-only for raw reads (it's only used for POSTing anyway).

### Smoke test — Done when

- [ ] Each endpoint responds correctly for a user with real session data
- [ ] Date ranges filter correctly (7d returns only last 7 days)
- [ ] Family endpoint returns one entry per user, shape is compact
- [ ] Compare endpoint with 3 userIds + metric=xp returns interleaved time series
- [ ] Empty-data user (e.g. brand-new Ben) returns zeroed shapes, not errors
- [ ] Response times < 500ms for 1-year range (acceptable for family-scale data)

Commit + tag `phase-14-done`.

---

## Phase 15 — Stats UI: graphs & Family Dashboard

**Goal:** Every user can see every user's usage, graphed. This is the signature feature.

### Tasks

1. `cd frontend && npm install recharts date-fns`
2. Create `frontend/src/charts/` — one small component per chart type in §5.8.2:
   - `LineOverTime.jsx` — configurable for XP / accuracy / etc, multi-user support
   - `DailyBars.jsx` — configurable for XP / sessions / minutes / cards
   - `CalendarHeatmap.jsx` — GitHub-contrib style (custom SVG or `react-calendar-heatmap` package)
   - `MasteryStack.jsx` — stacked bar of buckets
   - `TopNBars.jsx` — horizontal bar list (for struggle list)
   - `HourHistogram.jsx`
   - `ResponseTimeHistogram.jsx`
   - Each accepts `data` + `loading` + `colors` props; colors default to user's color from family palette
3. Create `screens/FamilyDashboard.jsx`:
   - Route: `/family`
   - Top row: 4 user cards (avatar, streak, XP this week, accuracy this week) — clickable → user stats
   - Section: "XP over time (all users)" — `LineOverTime` with all users overlaid
   - Section: "Activity this week" — `DailyBars` stacked per user
   - Section: "Accuracy trend" — `LineOverTime` all users
   - Section: "Who studies when?" — `HourHistogram` per user in a small grid
   - Range selector: 7d / 30d / 90d / 1y / all
4. Create `screens/UserStats.jsx`:
   - Route: `/stats/user/:userId` (any user can view any user)
   - Header: avatar, name, level, XP, streak, total time, total cards
   - Activity heatmap (calendar)
   - Tabs: Overview / Per Course / Badges
   - Overview: XP cumulative, daily XP, accuracy trend, sessions/day, time/day, hour histogram, response time
   - Per Course: grid of courses, click → CourseStats
   - Badges: badge wall
   - Range selector
5. Create `screens/CourseStats.jsx`:
   - Route: `/stats/course/:courseId`
   - Mastery distribution, sessions for that course over time, card struggle list (top 20)
6. Add nav entries: Dashboard → Family → [User picker] → User Stats → Course Stats breadcrumb
7. Use each user's `color` consistently across all charts (family color palette derived from user records)

### Smoke test — Done when

- [ ] Lex logs in, opens Family Dashboard, sees all 4 users on every chart
- [ ] Ranges change charts live (no reload)
- [ ] Clicking Mats's card navigates to Mats's stats page — full detail visible
- [ ] Heatmap shows correct daily intensity
- [ ] Mastery buckets sum to total card count for that course
- [ ] Card struggle list sorted by fail count, clickable
- [ ] Colors consistent per user across all charts
- [ ] Loads in < 2s for 1-year range on a mid-spec phone

Commit + tag `phase-15-done`.

---

## Phase 16 — Leaderboard & Compare view

**Goal:** Ranking table + flexible multi-user overlay charting.

### Tasks

1. Backend `GET /api/leaderboard?period=7d|30d|all`:
   - Returns: `[{ userId, name, color, avatar, xp, sessions, cardsStudied, accuracy, streak }]`
   - Sort by XP desc (primary)
   - Also return secondary rankings in separate keys: `mostAccurate`, `longestStreak`, `mostSessions`
2. Frontend `screens/Leaderboard.jsx`:
   - Period toggle (7d/30d/all)
   - Primary ranked list with XP bars
   - Three secondary cards: "🎯 Most accurate", "🔥 Longest streak", "💪 Most sessions"
3. Frontend `screens/CompareView.jsx`:
   - Multi-select user chips (defaults to all)
   - Metric dropdown: XP / Accuracy / Sessions / Cards / Minutes
   - Range selector
   - Big `LineOverTime` chart below, using `/api/stats/compare`
   - Secondary stacked-bar view for the same data (toggle: line / bars)

### Smoke test — Done when

- [ ] Leaderboard correctly ranks by XP for each period
- [ ] Secondary rankings highlight different users when they actually lead those metrics
- [ ] Compare view overlays 2+ users; toggling users in/out updates chart live
- [ ] Switching metric re-fetches and re-renders without glitches

Commit + tag `phase-16-done`.

---

## Phase 17 — PWA polish, settings, backup/export

**Goal:** Installable on phones, polished UX, data exportable.

### Tasks

1. PWA setup:
   - `public/manifest.json` with 192/512 icons, `start_url`, theme color
   - Service worker via `vite-plugin-pwa` — cache app shell only, NOT API data
   - App name in manifest: "LexiQuest" (generic; dynamic `[Name]Quest` stays in-app)
   - Add-to-home-screen prompt on mobile
2. Settings screen completion:
   - UI language toggle (done)
   - `auto_speak` toggle (done)
   - `daily_goal` number input (default 20)
   - `preferred_mode` default for sessions
   - Show streak freezes available
3. Backup/export (per user):
   - `GET /api/export` (returns own data only; admin can pass `?userId=` to export any)
   - Response: JSON with `{ user, courses, cards, sessions, attempts }`
   - Frontend: "Download my data" button in Settings → triggers download as `lexiquest-{name}-{date}.json`
4. Import-from-backup (admin only) — POST the JSON to restore. Nice-to-have; can skip if time-constrained.
5. Mobile UX polish:
   - Tap targets ≥ 44px
   - Bottom nav bar (Dashboard / Study / Family / Settings)
   - Swipe gestures in study: swipe right = knew it, swipe left = didn't know
   - Card flip animation (CSS 3D)
6. Dark mode:
   - System preference detection
   - Manual override in settings
   - CSS variables for theme
7. Final error handling pass:
   - Network error banners
   - Friendly 403/404/500 pages
   - Offline detection + banner

### Smoke test — Done when

- [ ] App installs to iOS + Android home screens
- [ ] Installed app launches full-screen, no browser chrome
- [ ] Dark mode works, respects system preference
- [ ] Exporting produces a valid JSON file with all user data
- [ ] All tap targets comfortable on phone
- [ ] Swipe gestures work in study session
- [ ] Network offline shows banner but doesn't crash UI

Commit + tag `phase-17-done`. 🎉

---

# 7. Open items intentionally deferred to v2

- Card sharing between users (copy-from-another-user button)
- Real offline sync with conflict resolution
- Typed-answer mode with fuzzy match (you said no — this is here for record)
- Year transition wizard (carry-forward mastered cards)
- Boss Round and Quick Fire session modes (structure is ready via `mode` field; UI deferred)
- Rich text / markdown in cards
- Native iOS/Android apps (PWA is sufficient)

---

# 8. Appendix: Glossary

| Term | Meaning |
|---|---|
| SM-2 | SuperMemo-2 spaced repetition algorithm |
| MCQ | Multiple Choice Question |
| Distractor | Plausible-but-wrong alternative answer for MCQ |
| Self-grade | User judges their own recall after reveal |
| Freeze (token) | One-day streak protection |
| Mastery bucket | Coarse categorization of a card's learning state |
| SWA | Azure Static Web Apps |

*End of design document v0.2. Ready for implementation.*