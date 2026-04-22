import type { Entity, TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";

export interface CascadeDeps {
  tables: TableStorage;
}

/**
 * Hard-delete a user and every row that references them.
 *
 * Order matters: children first, then parent rows, then the user row
 * itself. A mid-cascade failure leaves a partial state that a re-run
 * can recover (the helper is idempotent — rows already gone are no-ops).
 *
 * See `api/src/shared/table-partitions.ts` for the partition conventions
 * this relies on.
 */
export async function deleteUserAndCascade(
  deps: CascadeDeps,
  userId: string,
): Promise<void> {
  const { tables } = deps;

  // 1 + 2 — courses owned by user, and their cards.
  const courses = await tables.listByPartition<Entity>("courses", userId);
  for (const course of courses) {
    const cards = await tables.listByPartition<Entity>("cards", course.rowKey);
    for (const card of cards) {
      await tables.remove("cards", card.partitionKey, card.rowKey);
    }
  }

  // 3 — the course rows themselves.
  for (const course of courses) {
    await tables.remove("courses", course.partitionKey, course.rowKey);
  }

  // 4 — attempts owned by user.
  const attempts = await tables.listByPartition<Entity>("attempts", userId);
  for (const row of attempts) {
    await tables.remove("attempts", row.partitionKey, row.rowKey);
  }

  // 5 — sessions owned by user.
  const sessions = await tables.listByPartition<Entity>("sessions", userId);
  for (const row of sessions) {
    await tables.remove("sessions", row.partitionKey, row.rowKey);
  }

  // 6 — the user row itself.
  await tables.remove("users", PARTITIONS.users, userId);
}
