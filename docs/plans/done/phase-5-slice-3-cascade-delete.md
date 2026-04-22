---
phase: 5
slice: 3
name: Cascade-delete on user hard-delete
status: proposed
---

# Phase 5 · Slice 3 — cascade-delete of user-owned rows

## 1. Task

When `DELETE /api/users/{id}` runs, also delete the user's courses,
cards (of those courses), attempts, and sessions — so no orphan rows
remain after a user is removed.

## 2. Scope boundary

**IN**

- New helper `deleteUserAndCascade(deps, userId)` in
  `api/src/functions/user-cascade.ts`.
- Wire it into `users-id.ts` DELETE path.
- **Commit** the Phase 5+ partition conventions below in
  `api/src/shared/table-partitions.ts` (a single authoritative map +
  doc comment, so Phases 6/7/9 inherit them rather than re-inventing).
- Tests seed fake rows in courses / cards / attempts / sessions and
  verify the cascade wipes all of them — while leaving rows belonging
  to **other** users untouched.

**OUT**

- Creating the actual course / card / attempt / session row-writing
  handlers — those are Phases 6, 7, 8, 9.
- Soft-delete, audit log, or pre-deletion dry-run.
- Year rows — years are shared, not user-owned.
- Frontend — Slice 4.

## 3. Files to create / touch

- `api/src/shared/table-partitions.ts` — **new** constants for partition
  keys per table (documents the convention).
- `api/src/functions/user-cascade.ts` — **new** helper.
- `api/src/functions/user-cascade.test.ts` — **new** tests.
- `api/src/functions/users-id.ts` — call the helper on DELETE.
- `api/src/functions/users-id.test.ts` — extend with cascade tests.

## 4. Seams involved

- `tables` — `listByPartition`, `remove` across users / courses / cards
  / attempts / sessions.

No new seams. All fakes already exist.

## 5. Partition conventions (committed in this slice)

Documented in `api/src/shared/table-partitions.ts` so later phases
match. Rationale:

| Table     | partitionKey | rowKey                | Rationale |
|-----------|--------------|-----------------------|-----------|
| users     | `"users"`    | user UUID             | shared readable list (already in use) |
| years     | `"years"`    | year UUID             | shared readable list (already in use) |
| courses   | `user_id`    | course UUID           | "list my courses" is one partition scan |
| cards     | `course_id`  | card UUID             | "list cards for a course" is one partition scan |
| attempts  | `user_id`    | `{iso}_{uuid}`        | Design.md §5.8.4 / Phase 9 Slice 1 |
| sessions  | `user_id`    | `{iso}_{uuid}`        | matches attempts; same date-range scan pattern |

Cascade walk, given `userId = u`:

1. List courses where `partitionKey = u` → collect `course_id`s.
2. For each course, list cards where `partitionKey = course_id` →
   `remove()` every card.
3. `remove()` every course row.
4. List attempts where `partitionKey = u` → `remove()` each.
5. List sessions where `partitionKey = u` → `remove()` each.
6. `remove()` the user row itself.

## 6. RED test list

`user-cascade.test.ts` — helper unit tests:

- **C1**: Deletes a user with zero child rows without error.
  - name: `"cascade-deletes a user with no child rows"`
- **C2**: Removes courses where `partitionKey === userId`.
  - name: `"cascade removes courses owned by the user"`
- **C3**: Removes cards whose partition is one of the user's course ids.
  - name: `"cascade removes cards of the user's courses"`
- **C4**: Removes attempts where `partitionKey === userId`.
  - name: `"cascade removes attempts owned by the user"`
- **C5**: Removes sessions where `partitionKey === userId`.
  - name: `"cascade removes sessions owned by the user"`
- **C6**: Leaves another user's courses / cards / attempts / sessions
  untouched.
  - name: `"cascade does not touch other users' rows"`
- **C7**: Removes the user row itself at the end.
  - name: `"cascade removes the user row"`
- **C8**: Is idempotent — running it twice for the same userId is a
  no-op on the second run.
  - name: `"cascade is idempotent"`
- **C9**: Leaves shared rows (year, other users) intact.
  - name: `"cascade never touches years or other users"`

`users-id.test.ts` — integration tests:

- **I1**: DELETE cascades end-to-end: seed rows → DELETE → all gone.
  - name: `"DELETE cascades the user's courses, cards, attempts, and sessions"`
- **I2**: DELETE 404 on non-existent id does NOT call the cascade
  (no collateral damage).
  - name: `"DELETE 404 does not cascade"`

## 7. Open questions / assumptions

- **Assumption**: The partition conventions above are the ones Phases
  6/7/9 will use. If the user disagrees we change `table-partitions.ts`
  and the later phases inherit the change.
- **Assumption**: `cards` partitioning by `course_id` (not `user_id`) is
  the right move — it keeps "list cards for course X" as a single
  partition scan, which Phase 7 / 8 / 13 all need.
- **Assumption**: `attempts` and `sessions` rowKeys will be
  `{iso}_{uuid}` as Phase 9 Slice 1 spells out — we don't need the
  full format to be in place yet for the cascade (we only `remove()`
  by partitionKey + rowKey, which we learn from `listByPartition`).

## 8. Risks

- Wrong partition convention → later phases need to reshape, and the
  cascade would need to be rewritten. Mitigated by committing the
  conventions in a single shared constants file, cited from tests.
- Cascade leaves a foreign row behind (e.g. if a card is mis-
  partitioned). Mitigated by test C3 — seeds cards for two users and
  asserts only the target's vanish.
- Cascade touches a wrong partition (e.g. other user's courses). C6
  blocks that.
- Ordering: if we delete the user row first and something fails after,
  we have an orphan. Handler does user-row last so a mid-cascade
  failure leaves a recoverable partial state (re-running is
  idempotent).

## 9. Out-of-scope follow-ups

- Frontend AdminPanel + route guard + delete confirmation — Slice 4.
- `phase-5-done` tag after Slice 4 ships.
