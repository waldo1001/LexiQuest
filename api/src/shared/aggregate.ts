import type { TableStorage } from "./table-storage.js";
import type { AttemptRow } from "../functions/attempts-shared.js";
import type { SessionRow } from "../functions/sessions-shared.js";
import type { CardRow } from "../functions/cards-shared.js";
import type { CourseRow } from "../functions/courses-shared.js";

export type MasteryBucket = "new" | "learning" | "young" | "mature" | "mastered";

export function masteryBucket(card: { sm2_reps: number; sm2_interval: number }): MasteryBucket {
  if (card.sm2_reps === 0) return "new";
  if (card.sm2_interval < 7) return "learning";
  if (card.sm2_interval < 21) return "young";
  if (card.sm2_interval < 60) return "mature";
  return "mastered";
}

export function groupByDay<T>(items: T[], dateFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const date = dateFn(item).slice(0, 10);
    if (!result[date]) result[date] = [];
    result[date].push(item);
  }
  return result;
}

export function rollingAverage(series: number[], window: number): number[] {
  return series.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export function parseRange(range: string | null, now: Date = new Date()): { from: Date; to: Date } {
  let from: Date;
  switch (range) {
    case "7d":  from = new Date(now.getTime() - 7   * 86_400_000); break;
    case "30d": from = new Date(now.getTime() - 30  * 86_400_000); break;
    case "90d": from = new Date(now.getTime() - 90  * 86_400_000); break;
    case "1y":  from = new Date(now.getTime() - 365 * 86_400_000); break;
    default:    from = new Date(0); break;
  }
  return { from, to: now };
}

export async function fetchAttempts(
  tables: TableStorage,
  userId: string,
  from: Date,
  to: Date,
): Promise<AttemptRow[]> {
  return tables.listByRowKeyRange<AttemptRow>(
    "attempts",
    userId,
    from.toISOString(),
    to.toISOString() + "~",
  );
}

export async function fetchSessions(
  tables: TableStorage,
  userId: string,
  from: Date,
  to: Date,
): Promise<SessionRow[]> {
  return tables.listByRowKeyRange<SessionRow>(
    "sessions",
    userId,
    from.toISOString(),
    to.toISOString() + "~",
  );
}

export async function fetchCards(
  tables: TableStorage,
  userId: string,
): Promise<CardRow[]> {
  const courses = await tables.listByPartition<CourseRow>("courses", userId);
  const cardGroups = await Promise.all(
    courses.map((c) => tables.listByPartition<CardRow>("cards", c.rowKey)),
  );
  return cardGroups.flat();
}
