# Plan — Phase 7 (all slices) — Manual Cards

## 1. Task
Implement full CRUD for flashcards per course: backend `/api/cards` + `/api/cards/:id`, plus the `CardManager` screen with read-only enforcement for non-owners.

## 2. Scope boundary

**IN:**
- `cards-shared.ts` — `CardRow`, validators (`validateCardCreate`, `validateCardPatch`), `cardProfile`
- `cards.ts` — `GET /api/cards?courseId=` (any authed user), `POST /api/cards` (owner or admin)
- `cards-id.ts` — `PUT /api/cards/:id?courseId=`, `DELETE /api/cards/:id?courseId=` (owner or admin)
- Wire both into `api/src/index.ts`
- `frontend/src/lib/api.js` — `fetchCards`, `createCard`, `updateCard`, `deleteCard`
- `frontend/src/screens/CardManager.jsx` — table + inline edit + add form + delete confirm
- `frontend/src/screens/CardManager.test.jsx`
- `frontend/src/App.jsx` — add route `/courses/:courseId/cards`
- `frontend/src/i18n/strings.js` — cards.* keys in both en and nl
- `frontend/src/screens/CourseList.jsx` — "Manage cards" link per course

**OUT (deferred):**
- SM-2 scheduling / study sessions (Phase 8)
- AI import / distractors enrichment (Phase 12/13)
- Photo import
- Stats on cards

## 3. Files to create / touch

```
api/src/functions/cards-shared.ts       (new)
api/src/functions/cards-shared.test.ts  (new)
api/src/functions/cards.ts              (new)
api/src/functions/cards.test.ts         (new)
api/src/functions/cards-id.ts           (new)
api/src/functions/cards-id.test.ts      (new)
api/src/index.ts                        (touch — add registerCards + registerCardsId)
frontend/src/lib/api.js                 (touch — add card API functions)
frontend/src/screens/CardManager.jsx    (new)
frontend/src/screens/CardManager.test.jsx (new)
frontend/src/App.jsx                    (touch — add /courses/:courseId/cards route)
frontend/src/i18n/strings.js            (touch — add cards.* keys)
frontend/src/screens/CourseList.jsx     (touch — add "Manage cards" link)
```

## 4. Seams involved

`tables` | `clock` | `signer` | `random` | `fetch`

## 5. RED test list

### cards-shared.ts
- AC1: `validateCardCreate` accepts valid body → `cards-shared.test.ts`: "accepts valid create body"
- AC2: `validateCardCreate` rejects missing question → "rejects body with missing question"
- AC3: `validateCardCreate` rejects missing answer → "rejects body with missing answer"
- AC4: `validateCardCreate` rejects missing course_id → "rejects body with missing course_id"
- AC5: `validateCardCreate` accepts pipe-separated answer → "accepts pipe-separated answer verbatim"
- AC6: `validateCardCreate` rejects invalid source → "rejects unknown source enum"
- AC7: `cardProfile` maps row to response DTO → "cardProfile maps row fields correctly"
- AC8: `validateCardPatch` accepts partial patch → "accepts partial patch with question only"
- AC9: `validateCardPatch` rejects empty object → "accepts empty patch (no fields required)"

### cards.ts
- AC10: GET without auth → 401 → `cards.test.ts`: "GET without cookie returns 401"
- AC11: GET without courseId → 400 → "GET without courseId returns 400"
- AC12: GET with courseId returns empty list → "GET with courseId returns empty array when no cards"
- AC13: GET with courseId returns cards for that course → "GET with courseId returns cards list"
- AC14: POST without auth → 401 → "POST without cookie returns 401"
- AC15: POST creates card with SM-2 defaults → "POST creates card with SM-2 defaults ease=2.5 interval=0 reps=0"
- AC16: POST next_review_at ≤ now → "POST sets next_review_at to clock.now()"
- AC17: POST by non-owner returns 403 → "POST by non-owner returns 403"
- AC18: POST by admin on other's course succeeds → "POST by admin on another owner's course returns 201"
- AC19: POST on non-existent course returns 404 → "POST with unknown courseId returns 404"
- AC20: POST stores pipe-separated answer verbatim → "POST stores pipe-separated answer verbatim"
- AC21: POST without required field returns 400 → "POST with missing question returns 400"

### cards-id.ts
- AC22: PUT without auth → 401 → `cards-id.test.ts`: "PUT without cookie returns 401"
- AC23: PUT without courseId query → 400 → "PUT without courseId query param returns 400"
- AC24: PUT on non-existent card → 404 → "PUT on unknown card id returns 404"
- AC25: PUT by owner updates card → "PUT by owner updates card fields"
- AC26: PUT by non-owner returns 403 → "PUT by non-owner returns 403"
- AC27: PUT by admin on other's card succeeds → "PUT by admin on another owner's card returns 200"
- AC28: DELETE without auth → 401 → "DELETE without cookie returns 401"
- AC29: DELETE without courseId query → 400 → "DELETE without courseId query param returns 400"
- AC30: DELETE on non-existent card → 404 → "DELETE on unknown card id returns 404"
- AC31: DELETE by owner removes card → "DELETE by owner removes card from storage"
- AC32: DELETE by non-owner returns 403 → "DELETE by non-owner returns 403"
- AC33: DELETE by admin on other's card succeeds → "DELETE by admin on another owner's card returns 204"

### frontend api.js (tested via CardManager tests — no separate api.js unit tests needed)
- AC34: `fetchCards` calls GET /api/cards?courseId=
- AC35: `createCard` calls POST /api/cards
- AC36: `updateCard` calls PUT /api/cards/:id?courseId=
- AC37: `deleteCard` calls DELETE /api/cards/:id?courseId=

### CardManager.jsx
- AC38: shows loading state while fetching → `CardManager.test.jsx`: "shows loading before cards are fetched"
- AC39: renders card list → "renders list of cards with question and answer"
- AC40: owner sees edit/delete buttons → "owner sees edit and delete buttons per card"
- AC41: non-owner hides edit/delete buttons → "non-owner does not see edit or delete buttons"
- AC42: add form creates card → "submitting add form calls createCard and appends to list"
- AC43: inline edit saves card → "saving inline edit calls updateCard and updates list"
- AC44: delete with confirm removes card → "confirming delete calls deleteCard and removes from list"
- AC45: 403 on save shows error → "403 from updateCard shows forbidden error message"
- AC46: back link present → "back link navigates to /courses"

## 6. Open questions / assumptions

- **Assumption**: `PUT /api/cards/:id?courseId=...` and `DELETE /api/cards/:id?courseId=...` require courseId as a query param. The frontend always has this (it's in the route `/courses/:courseId/cards`). This avoids scanning all course partitions.
- **Assumption**: The non-owner GET is allowed (any authenticated user can read any course's cards). Edit buttons are hidden in the frontend based on `ownerId === currentUser.id`. A 403 guard still exists on the API for safety.
- **Assumption**: For the admin owner-check in cards.ts POST, we look up the course by scanning the caller's own courses first, then all users (same pattern as `findCourseAnywhere` in courses-id.ts).
- **Assumption**: `distractors` defaults to `[]` on create (the field exists in the model for later AI import; for manual cards it's always empty).
- **Assumption**: `source` defaults to `'manual'` when not specified on create.

## 7. Risks

- The `findCourseAnywhere` helper is duplicated between `courses-id.ts` and `cards.ts`. Keep local — refactor only if a third caller appears.
- Branch coverage on CardManager.jsx may be under 70% without tests for every loading/error state — add tests for error path.
- `distractors` JSON serialization: FakeTableStorage stores arrays as-is; production uses JSON strings via `serializeJsonFields`. Tests that read back distractors from FakeStorage will see `string[]` not JSON strings, which is correct behavior for the interface layer.

## 8. Out-of-scope follow-ups

- SM-2 recalculation on card attempts (Phase 8)
- Distractor enrichment via Claude (Phase 13)
- Photo import (Phase 12)
- Card list from study session (Phase 8)
- Delete card from CardManager should also clear its attempts (Phase 9+ cleanup)
