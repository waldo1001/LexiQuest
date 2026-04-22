import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { Clock } from "../shared/clock.js";
import type { Random } from "../shared/random.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { CardRow } from "./cards-shared.js";
import { applySm2 } from "../shared/sm2.js";
import {
  validateAttemptsBody,
  makeAttemptRowKey,
  type AttemptRow,
} from "./attempts-shared.js";
import { type SessionRow, rowKeyToId } from "./sessions-shared.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";

export interface AttemptsDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

export function makeAttemptsHandler(deps: AttemptsDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "POST").toUpperCase() !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const result = validateAttemptsBody(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { sessionId, items } = result.value;

    // Find the session — check caller first, then other users (to distinguish 404 vs 403)
    const { session, ownerUserId } = await findSessionAnywhere(
      deps.tables,
      auth.auth.userId,
      sessionId,
    );
    if (!session) {
      return { status: 404, jsonBody: { error: "session not found" } };
    }
    if (ownerUserId !== auth.auth.userId) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const now = deps.clock.now();
    const nowIso = now.toISOString();

    for (const item of items) {
      // Look up the card
      const card = await deps.tables.getById<CardRow>(
        "cards",
        session.course_id,
        item.cardId,
      );
      if (!card) {
        return { status: 404, jsonBody: { error: `card not found: ${item.cardId}` } };
      }

      // Log the attempt
      const attemptId = deps.random.uuid();
      const attemptRow: AttemptRow = {
        partitionKey: auth.auth.userId,
        rowKey: makeAttemptRowKey(nowIso, attemptId),
        user_id: auth.auth.userId,
        card_id: item.cardId,
        session_id: sessionId,
        correct: item.correct,
        mode: item.mode,
        response_time_ms: item.response_time_ms,
        timestamp: nowIso,
      };
      await deps.tables.upsert<AttemptRow>("attempts", attemptRow);

      // Update SM-2 on the card
      const quality = item.correct ? 5 : 0;
      const sm2 = applySm2(
        { sm2_ease: card.sm2_ease, sm2_interval: card.sm2_interval, sm2_reps: card.sm2_reps },
        quality,
        now,
      );
      const updatedCard: CardRow = {
        ...card,
        sm2_ease: sm2.ease,
        sm2_interval: sm2.interval,
        sm2_reps: sm2.reps,
        next_review_at: sm2.next_review_at,
      };
      await deps.tables.upsert<CardRow>("cards", updatedCard);
    }

    return { status: 201, jsonBody: { logged: items.length } };
  };
}

async function findSessionAnywhere(
  tables: TableStorage,
  callerUserId: string,
  sessionId: string,
): Promise<{ session: SessionRow | null; ownerUserId: string }> {
  const own = await tables.listByPartition<SessionRow>("sessions", callerUserId);
  const found = own.find((s) => rowKeyToId(s.rowKey) === sessionId);
  if (found) return { session: found, ownerUserId: callerUserId };

  const users = await tables.listByPartition<UserRow>("users", PARTITIONS.users);
  for (const u of users) {
    if (u.rowKey === callerUserId) continue;
    const others = await tables.listByPartition<SessionRow>("sessions", u.rowKey);
    const hit = others.find((s) => rowKeyToId(s.rowKey) === sessionId);
    if (hit) return { session: hit, ownerUserId: u.rowKey };
  }
  return { session: null, ownerUserId: "" };
}

/* v8 ignore start */
export function registerAttempts(deps: AttemptsDeps): void {
  app.http("attempts", {
    route: "attempts",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeAttemptsHandler(deps),
  });
}
/* v8 ignore stop */
