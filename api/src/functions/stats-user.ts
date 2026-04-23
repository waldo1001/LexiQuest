import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { Clock } from "../shared/clock.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import {
  masteryBucket,
  groupByDay,
  parseRange,
  fetchAttempts,
  fetchSessions,
  fetchCards,
} from "../shared/aggregate.js";

export interface StatsUserDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeStatsUserHandler(deps: StatsUserDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    /* v8 ignore next */
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const params = (req as unknown as { params?: Record<string, string> }).params;
    /* v8 ignore next */
    const userId = params?.userId ?? "";

    const user = await deps.tables.getById<UserRow>("users", PARTITIONS.users, userId);
    if (!user) return { status: 404, jsonBody: { error: "user not found" } };

    const rangeParam = (req.query as { get(k: string): string | null }).get("range");
    const now = deps.clock.now();
    const { from, to } = parseRange(rangeParam, now);

    const [allUserSessions, rangedSessions, rangedAttempts, allCards] = await Promise.all([
      deps.tables.listByPartition("sessions", userId),
      fetchSessions(deps.tables, userId, from, to),
      fetchAttempts(deps.tables, userId, from, to),
      fetchCards(deps.tables, userId),
    ]);

    /* v8 ignore next */
    const settings = user.settings ?? {};
    const totalXp = settings.total_xp ?? 0;
    const level = Math.floor(totalXp / 200);
    const currentStreak = settings.streak ?? 0;
    const longestStreak = currentStreak; // simplified — no historical tracking
    const badgesEarned = settings.badges ?? [];

    const totalSessions = allUserSessions.length;
    const totalCardsStudied = allUserSessions.reduce((sum, s) => sum + (s as { cards_studied: number }).cards_studied, 0);
    const totalMinutes = allUserSessions.reduce((sum, s) => sum + (s as { duration_seconds: number }).duration_seconds, 0) / 60;

    // Trend data (ranged)
    const sessionsByDay = groupByDay(rangedSessions, (s) => s.started_at);
    const sessionsPerDay = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({ date, count: sessions.length }));

    const dailyXp = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({
        date,
        xp: sessions.reduce((s, x) => s + x.xp_earned, 0),
      }));

    const timeStudiedPerDay = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => ({
        date,
        minutes: sessions.reduce((s, x) => s + x.duration_seconds, 0) / 60,
      }));

    const accuracyTrend = Object.entries(sessionsByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sessions]) => {
        const studied = sessions.reduce((s, x) => s + x.cards_studied, 0);
        const correct = sessions.reduce((s, x) => s + x.cards_correct, 0);
        return { date, pctFirstTry: studied > 0 ? Math.round((correct / studied) * 100) : 0 };
      });

    // Cumulative XP over time (starts at 0 for range)
    let cumXp = 0;
    const xpOverTime = dailyXp.map(({ date, xp }) => {
      cumXp += xp;
      return { date, cumulativeXp: cumXp };
    });

    // Hour of day distribution
    const hourCounts = new Array<number>(24).fill(0);
    for (const attempt of rangedAttempts) {
      const h = new Date(attempt.timestamp).getUTCHours();
      hourCounts[h]++;
    }
    const hourOfDay = hourCounts.map((attempts, hour) => ({ hour, attempts }));

    // Response time buckets
    const rtBuckets = { "<1s": 0, "1-3s": 0, "3-10s": 0, ">10s": 0 };
    for (const a of rangedAttempts) {
      const ms = a.response_time_ms;
      if (ms < 1000) rtBuckets["<1s"]++;
      else if (ms < 3000) rtBuckets["1-3s"]++;
      else if (ms < 10000) rtBuckets["3-10s"]++;
      else rtBuckets[">10s"]++;
    }
    const responseTimeBuckets = Object.entries(rtBuckets).map(([bucket, count]) => ({ bucket, count }));

    // Mastery distribution
    const masteryDistribution = { new: 0, learning: 0, young: 0, mature: 0, mastered: 0 };
    for (const card of allCards) {
      masteryDistribution[masteryBucket(card)]++;
    }

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: {
        totalXp,
        level,
        currentStreak,
        longestStreak,
        totalCardsStudied,
        totalSessions,
        totalMinutes,
        accuracyTrend,
        xpOverTime,
        dailyXp,
        sessionsPerDay,
        timeStudiedPerDay,
        hourOfDay,
        responseTimeBuckets,
        masteryDistribution,
        badgesEarned,
      },
    };
  };
}

/* v8 ignore start */
export function registerStatsUser(deps: StatsUserDeps): void {
  app.http("stats-user", {
    route: "stats/user/{userId}",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsUserHandler(deps),
  });
}
/* v8 ignore stop */
