import type { Entity, TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import { deleteCourseAndCascadeCards } from "./courses-shared.js";

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

  const courses = await tables.listByPartition<Entity>("courses", userId);
  for (const course of courses) {
    await deleteCourseAndCascadeCards(tables, userId, course.rowKey);
  }

  const attempts = await tables.listByPartition<Entity>("attempts", userId);
  for (const row of attempts) {
    await tables.remove("attempts", row.partitionKey, row.rowKey);
  }

  const sessions = await tables.listByPartition<Entity>("sessions", userId);
  for (const row of sessions) {
    await tables.remove("sessions", row.partitionKey, row.rowKey);
  }

  await tables.remove("users", PARTITIONS.users, userId);
}
