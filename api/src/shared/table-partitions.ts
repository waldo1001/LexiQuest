/**
 * Partition-key conventions for every LexiQuest table.
 *
 * Committed in Phase 5 Slice 3 so later phases inherit a single
 * authoritative convention rather than re-inventing per table. See
 * Design.md §3.2 / §5.8.4 and docs/plans/done/phase-5-slice-3-
 * cascade-delete.md for rationale.
 */

export const PARTITIONS = {
  /** Shared readable list; every user row is in the single "users" partition. */
  users: "users",
  /** Shared readable list; every year row is in the single "years" partition. */
  years: "years",
} as const;

/**
 * Row `partitionKey` discriminants for user-owned tables.
 *
 * - `courses.partitionKey === user_id`
 * - `cards.partitionKey === course_id`
 * - `attempts.partitionKey === user_id`
 * - `sessions.partitionKey === user_id`
 */
export const USER_OWNED_PARTITION = {
  courses: "user_id",
  cards: "course_id",
  attempts: "user_id",
  sessions: "user_id",
} as const;
