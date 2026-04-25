# Gaming Mode — Session Length + Game Types

## Context

With hundreds of cards per course, the current "study all due cards" model becomes unwieldy. `POST /api/sessions` returns **every** due card plus up to 20 new cards with no cap — a user who falls behind could face a 150-card session with no way to say "just give me 15 minutes."

This feature adds:
1. **Session size picker** — user chooses card count before starting
2. **Smart priority** — when due cards exceed the limit, a blended overdue-urgency + mastery-weakness score selects the most important cards
3. **Game types** — Classic, Boss Round, Speed Round, Review Blitz — each with distinct queue rules, XP multipliers, and UX

## Data Model Changes

**`SessionRow`** and **`SessionCreateBody`** in `api/src/functions/sessions-shared.ts`:
- Add `game_type: GameType` (`"classic" | "boss_round" | "speed_round" | "review_blitz"`)
- Add `card_limit: number | null` (null = all)
- Defaults: `game_type → "classic"`, `card_limit → null` (backward compatible, no migration needed — Table Storage is schema-less)

**`SessionProfile`**: add both fields. `sessionProfile()` defaults missing values on old rows.

## Priority Algorithm (`api/src/shared/card-priority.ts`, new file)

```
score(card, now) = 0.7 × overdueRatio + 0.3 × masteryScore

overdueRatio = clamp(0, 2, (now - next_review_at) / (interval × DAY_MS))
masteryScore = (3.0 - ease) / 1.7 + 1 / (reps + 1)
```

### Queue rules per game type

| Game Type | Due cards | New cards | Sort | Shuffle |
|-----------|-----------|-----------|------|---------|
| **Classic** | Top N by score (75% of limit) | Fill remaining 25% | By score | Yes (after selection) |
| **Boss Round** | Only cards with `ease < 2.0` | None | Hardest first (lowest ease) | No |
| **Speed Round** | Top N by score | Fill like Classic | By score | No |
| **Review Blitz** | Only overdue, most-overdue-first | None | By overdue ratio desc | No |

When `cardLimit` is null, Classic behaves exactly like today (all due + up to 20 new, shuffled).

## XP Changes (`api/src/shared/xp.ts`)

| Game Type | Per-card multiplier | Extra bonus |
|-----------|-------------------|-------------|
| Classic | 1.0x | — |
| Boss Round | 1.5x | +50 XP completion |
| Speed Round | 1.25x | — |
| Review Blitz | 1.0x | — |

Multiplier applies to per-card XP only (not session/perfect bonuses). `sessions-id.ts` line 108: pass `bossRoundComplete: game_type === "boss_round"` to unlock the existing `BOSS_SLAYER` badge.

## Frontend Changes

### New: `SessionSetup.jsx` — pre-session config screen
- Route: `/courses/:courseId/setup` (inserted before `/study`)
- Game type picker (4 illustrated cards)
- Card count picker (pills: 10, 15, 20, 30, All — default 20)
- Grading mode picker (when course `default_mode === "ask"`)
- "Start" button → navigates to `/study` with `{ gameType, cardLimit, mode }` in state

### Modified: `StudySession.jsx`
- Read `gameType` / `cardLimit` from location state, pass to `startSession()`
- **Speed Round**: countdown timer (session-level, e.g. 60s), auto-finish on expiry, no retry pile
- Game type indicator in header

### Modified: `SessionResults.jsx`
- Show game type + XP multiplier info
- Speed Round: cards-per-minute stat
- Boss Round: boss slayer messaging

### Navigation changes
- Dashboard/CourseList "Study" → `/courses/:courseId/setup` (instead of direct `/study`)
- Direct `/study` still works with defaults (backward compat)

## Slice Breakdown (10 slices)

### Slice 1 — Priority scoring module (API)
Create `api/src/shared/card-priority.ts` + tests. Pure functions: `scoreCard()`, `buildQueue()` for Classic mode only.

### Slice 2 — Game type data model + validation (API)
Add `GameType`, extend `SessionRow`, `SessionCreateBody`, `SessionProfile`, validation in `sessions-shared.ts`. Backward-compatible defaults.

### Slice 3 — Game-type queue builders (API)
Add `boss_round`, `speed_round`, `review_blitz` branches to `buildQueue()` in `card-priority.ts`.

### Slice 4 — Wire priority into session creation (API)
Replace queue-building logic in `sessions.ts` with `buildQueue()`. Store `game_type` + `card_limit` on session row. Speed round returns `time_limit_seconds`.

### Slice 5 — XP multipliers + Boss Round badge (API + frontend mirror)
Extend `computeSessionXp` with game type multiplier. Wire `bossRoundComplete` in `sessions-id.ts`. Mirror in `frontend/src/lib/xp.js`.

### Slice 6 — Frontend API client update
Update `api.js` `startSession()` to send `gameType` and `cardLimit`.

### Slice 7 — SessionSetup screen (Frontend)
New screen with game type picker, card count picker, mode picker. Route + navigation changes.

### Slice 8 — Speed Round timer (Frontend)
Countdown timer in `StudySession.jsx`. Auto-finish on expiry. No retry pile for speed rounds.

### Slice 9 — Game type in SessionResults (Frontend)
Display game type, multiplier, game-specific stats on results screen.

### Slice 10 — Integration + edge cases
Boss Round with no hard cards → empty state. Speed Round partial results. Review Blitz with nothing overdue → empty. `cardLimit: 0` → 400 error.

## Key files

| File | Change |
|------|--------|
| `api/src/shared/card-priority.ts` | **New** — scoring + queue building |
| `api/src/functions/sessions-shared.ts` | Extend types, validation |
| `api/src/functions/sessions.ts` | Use `buildQueue()`, store new fields |
| `api/src/functions/sessions-id.ts` | Pass game_type to XP + badges |
| `api/src/shared/xp.ts` | Add multipliers |
| `frontend/src/screens/SessionSetup.jsx` | **New** — pre-session config |
| `frontend/src/screens/StudySession.jsx` | Timer, game-type-aware behavior |
| `frontend/src/screens/SessionResults.jsx` | Game-type display |
| `frontend/src/lib/api.js` | Extended `startSession()` |
| `frontend/src/i18n/strings.js` | ~30 new keys (en + nl) |
| `frontend/src/App.jsx` | New route |

## Verification

1. `cd api && npx vitest run` — all API tests green, 90%+ coverage on touched files
2. `cd frontend && npx vitest run` — all frontend tests green, 70%+ on touched screens
3. Manual: start a Classic session with limit 10 → get exactly 10 cards
4. Manual: start a Boss Round → only hard cards appear, XP shows 1.5x, badge awarded
5. Manual: start a Speed Round → timer counts down, session auto-ends at 0
6. Manual: old API clients (no gameType/cardLimit) → identical behavior to today
