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
import { parseRange, fetchSessions } from "../shared/aggregate.js";

export interface LeaderboardDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  color: string;
  avatar: string;
  xp: number;
  sessions: number;
  cardsStudied: number;
  accuracy: number;
  streak: number;
}

export function makeLeaderboardHandler(deps: LeaderboardDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    /* v8 ignore next */
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const query = req.query as { get(k: string): string | null };
    const period = query.get("period");
    const now = deps.clock.now();
    const { from, to } = parseRange(period, now);

    const allUsers = await deps.tables.listByPartition<UserRow>("users", PARTITIONS.users);

    const entries: LeaderboardEntry[] = await Promise.all(
      allUsers.map(async (u) => {
        const settings = u.settings ?? {};
        const sessions = await fetchSessions(deps.tables, u.rowKey, from, to);
        const totalStudied = sessions.reduce((s, x) => s + x.cards_studied, 0);
        const totalCorrect = sessions.reduce((s, x) => s + x.cards_correct, 0);
        const accuracy = totalStudied > 0 ? Math.round((totalCorrect / totalStudied) * 100) : 0;
        return {
          userId: u.rowKey,
          name: u.name,
          color: u.color,
          avatar: u.avatar_emoji,
          xp: settings.total_xp ?? 0,
          sessions: sessions.length,
          cardsStudied: totalStudied,
          accuracy,
          streak: settings.streak ?? 0,
        };
      }),
    );

    const rankings = [...entries].sort((a, b) => b.xp - a.xp);

    const mostAccurate = entries.reduce<LeaderboardEntry | undefined>((best, e) => (!best || e.accuracy > best.accuracy ? e : best), undefined);
    const longestStreak = entries.reduce<LeaderboardEntry | undefined>((best, e) => (!best || e.streak > best.streak ? e : best), undefined);
    const mostSessions = entries.reduce<LeaderboardEntry | undefined>((best, e) => (!best || e.sessions > best.sessions ? e : best), undefined);

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { rankings, mostAccurate, longestStreak, mostSessions },
    };
  };
}

/* v8 ignore start */
export function registerLeaderboard(deps: LeaderboardDeps): void {
  app.http("leaderboard", {
    route: "leaderboard",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeLeaderboardHandler(deps),
  });
}
/* v8 ignore stop */
