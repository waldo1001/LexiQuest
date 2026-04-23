import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { Clock } from "../shared/clock.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import { type SessionRow, rowKeyToId, sessionProfile } from "./sessions-shared.js";
import type { AttemptRow } from "./attempts-shared.js";
import { computeSessionXp } from "../shared/xp.js";
import { computeNewStreak } from "../shared/streak.js";

const BRUSSELS_TZ = "Europe/Brussels";

export interface SessionsIdDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeSessionsIdHandler(deps: SessionsIdDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "PUT").toUpperCase() !== "PUT") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const sessionId = (req as unknown as { params?: Record<string, string> }).params?.id ?? "";

    const body = await req.json().catch(() => null);
    const closeBody = validateCloseBody(body);
    if (!closeBody.ok) {
      return { status: 400, jsonBody: { error: closeBody.error } };
    }

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
    if (session.ended_at != null) {
      return { status: 409, jsonBody: { error: "session already closed" } };
    }

    const now = deps.clock.now();
    const nowIso = now.toISOString();
    const startedMs = new Date(session.started_at).getTime();
    const durationSeconds = Math.round((now.getTime() - startedMs) / 1000);

    // Fetch attempts for this session to compute XP
    const allAttempts = await deps.tables.listByPartition<AttemptRow>("attempts", auth.auth.userId);
    const sessionAttempts = allAttempts.filter((a) => a.session_id === sessionId);

    const xpEarned = computeSessionXp(
      { cards_studied: closeBody.value.cards_studied, cards_correct: closeBody.value.cards_correct },
      sessionAttempts,
    );

    const updated: SessionRow = {
      ...session,
      ended_at: nowIso,
      cards_studied: closeBody.value.cards_studied,
      cards_correct: closeBody.value.cards_correct,
      duration_seconds: durationSeconds,
      xp_earned: xpEarned,
    };
    await deps.tables.upsert<SessionRow>("sessions", updated);

    // Update user streak
    const userRow = await deps.tables.getById<UserRow>("users", PARTITIONS.users, auth.auth.userId);
    if (userRow) {
      const existingSettings = typeof userRow.settings === "string"
        ? JSON.parse(userRow.settings as unknown as string)
        : userRow.settings;
      const streakResult = computeNewStreak(
        {
          streak: existingSettings.streak ?? 0,
          last_session_date: existingSettings.last_session_date ?? null,
          freeze_tokens: existingSettings.freeze_tokens ?? 0,
        },
        nowIso,
        BRUSSELS_TZ,
      );
      const updatedUser: UserRow = {
        ...userRow,
        settings: {
          ...existingSettings,
          streak: streakResult.streak,
          last_session_date: streakResult.last_session_date,
          freeze_tokens: streakResult.freeze_tokens,
        },
      };
      await deps.tables.upsert<UserRow>("users", updatedUser);
    }

    return { status: 200, jsonBody: { ...sessionProfile(updated), xp_earned: xpEarned } };
  };
}

function validateCloseBody(
  body: unknown,
): { ok: true; value: { cards_studied: number; cards_correct: number } } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.cards_studied !== "number") {
    return { ok: false, error: "cards_studied is required" };
  }
  if (typeof src.cards_correct !== "number") {
    return { ok: false, error: "cards_correct is required" };
  }
  return { ok: true, value: { cards_studied: src.cards_studied, cards_correct: src.cards_correct } };
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
export function registerSessionsId(deps: SessionsIdDeps): void {
  app.http("sessions-id", {
    route: "sessions/{id}",
    methods: ["PUT"],
    authLevel: "anonymous",
    handler: makeSessionsIdHandler(deps),
  });
}
/* v8 ignore stop */
