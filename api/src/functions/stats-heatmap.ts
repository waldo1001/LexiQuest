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
import { groupByDay, parseRange, fetchAttempts } from "../shared/aggregate.js";

export interface StatsHeatmapDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeStatsHeatmapHandler(deps: StatsHeatmapDeps): HttpHandler {
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

    const attempts = await fetchAttempts(deps.tables, userId, from, to);
    const byDay = groupByDay(attempts, (a) => a.timestamp);

    const heatmap = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, count: items.length }));

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { heatmap },
    };
  };
}

/* v8 ignore start */
export function registerStatsHeatmap(deps: StatsHeatmapDeps): void {
  app.http("stats-heatmap", {
    route: "stats/heatmap/{userId}",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsHeatmapHandler(deps),
  });
}
/* v8 ignore stop */
