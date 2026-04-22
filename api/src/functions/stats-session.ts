import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import { type SessionRow, rowKeyToId, sessionProfile } from "./sessions-shared.js";

export interface StatsSessionDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

export function makeStatsSessionHandler(deps: StatsSessionDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const sessionId = (req as unknown as { params?: Record<string, string> }).params?.id ?? "";

    // Scan all user partitions to find the session (stats are family-visible)
    const session = await findSessionAnywhere(deps.tables, auth.auth.userId, sessionId);
    if (!session) {
      return { status: 404, jsonBody: { error: "session not found" } };
    }

    const profile = sessionProfile(session);
    const accuracy =
      session.cards_studied > 0
        ? Math.round((session.cards_correct / session.cards_studied) * 100)
        : 0;

    return {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
      jsonBody: { ...profile, accuracy },
    };
  };
}

async function findSessionAnywhere(
  tables: TableStorage,
  callerUserId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  // Check caller's partition first (fast path)
  const own = await tables.listByPartition<SessionRow>("sessions", callerUserId);
  const found = own.find((s) => rowKeyToId(s.rowKey) === sessionId);
  if (found) return found;

  // Scan all other users (stats are family-visible)
  const users = await tables.listByPartition<UserRow>("users", PARTITIONS.users);
  for (const u of users) {
    if (u.rowKey === callerUserId) continue;
    const sessions = await tables.listByPartition<SessionRow>("sessions", u.rowKey);
    const hit = sessions.find((s) => rowKeyToId(s.rowKey) === sessionId);
    if (hit) return hit;
  }
  return null;
}

/* v8 ignore start */
export function registerStatsSession(deps: StatsSessionDeps): void {
  app.http("stats-session", {
    route: "stats/session/{id}",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeStatsSessionHandler(deps),
  });
}
/* v8 ignore stop */
