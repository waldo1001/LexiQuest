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
import type { SessionRow } from "./sessions-shared.js";
import { groupByDay, parseRange, fetchSessions } from "../shared/aggregate.js";

export interface StatsFamilyDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

const VALID_METRICS = new Set(["xp", "accuracy", "sessions", "cards", "minutes"]);

export function makeStatsFamilyHandler(deps: StatsFamilyDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const rangeParam = (req.query as { get(k: string): string | null }).get("range");
    const now = deps.clock.now();
    const { from, to } = parseRange(rangeParam, now);

    const allUsers = await deps.tables.listByPartition<UserRow>("users", PARTITIONS.users);

    const userEntries = await Promise.all(
      allUsers.map(async (u) => {
        const settings = u.settings ?? {};
        const rangedSessions = await fetchSessions(deps.tables, u.rowKey, from, to);
        const totalStudied = rangedSessions.reduce((s, x) => s + x.cards_studied, 0);
        const totalCorrect = rangedSessions.reduce((s, x) => s + x.cards_correct, 0);
        const accuracy = totalStudied > 0 ? Math.round((totalCorrect / totalStudied) * 100) : 0;

        return {
          userId: u.rowKey,
          name: u.name,
          color: u.color,
          avatar: u.avatar_emoji,
          xp: settings.total_xp ?? 0,
          streak: settings.streak ?? 0,
          accuracy,
          sessionsLastN: rangedSessions.length,
          cardsLastN: totalStudied,
        };
      }),
    );

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { users: userEntries },
    };
  };
}

export function makeStatsCompareHandler(deps: StatsFamilyDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const query = req.query as { get(k: string): string | null };
    const userIdsParam = query.get("userIds");
    const metric = query.get("metric");
    const rangeParam = query.get("range");

    if (!userIdsParam) return { status: 400, jsonBody: { error: "userIds is required" } };
    if (!metric || !VALID_METRICS.has(metric)) {
      return { status: 400, jsonBody: { error: "metric must be one of: xp, accuracy, sessions, cards, minutes" } };
    }

    const userIds = userIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const now = deps.clock.now();
    const { from, to } = parseRange(rangeParam, now);

    // Fetch sessions for all requested users
    const sessionsByUser = await Promise.all(
      userIds.map(async (uid) => ({ uid, sessions: await fetchSessions(deps.tables, uid, from, to) })),
    );

    // Collect all days across all users
    const allDays = new Set<string>();
    for (const { sessions } of sessionsByUser) {
      for (const s of sessions) {
        allDays.add(s.started_at.slice(0, 10));
      }
    }

    const sortedDays = Array.from(allDays).sort();

    const series = sortedDays.map((date) => {
      const entry: Record<string, unknown> = { date };
      for (const { uid, sessions } of sessionsByUser) {
        const daySessions = sessions.filter((s) => s.started_at.startsWith(date));
        entry[uid] = computeMetric(daySessions, metric);
      }
      return entry;
    });

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { series },
    };
  };
}

function computeMetric(sessions: SessionRow[], metric: string): number {
  switch (metric) {
    case "xp":       return sessions.reduce((s, x) => s + x.xp_earned, 0);
    case "sessions": return sessions.length;
    case "cards":    return sessions.reduce((s, x) => s + x.cards_studied, 0);
    case "minutes":  return sessions.reduce((s, x) => s + x.duration_seconds, 0) / 60;
    case "accuracy": {
      const studied = sessions.reduce((s, x) => s + x.cards_studied, 0);
      const correct = sessions.reduce((s, x) => s + x.cards_correct, 0);
      return studied > 0 ? Math.round((correct / studied) * 100) : 0;
    }
    /* v8 ignore next */
    default: return 0;
  }
}

/* v8 ignore start */
export function registerStatsFamily(deps: StatsFamilyDeps): void {
  app.http("stats-family", {
    route: "stats/family",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsFamilyHandler(deps),
  });
  app.http("stats-compare", {
    route: "stats/compare",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsCompareHandler(deps),
  });
}
/* v8 ignore stop */
