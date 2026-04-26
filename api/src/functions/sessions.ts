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
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CardRow } from "./cards-shared.js";
import { cardProfile } from "./cards-shared.js";
import type { CourseRow } from "./courses-shared.js";
import {
  validateSessionCreate,
  makeSessionRowKey,
  type SessionRow,
} from "./sessions-shared.js";
import { buildQueue } from "../shared/card-priority.js";

export interface SessionsDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

export function makeSessionsHandler(deps: SessionsDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "POST").toUpperCase() !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const result = validateSessionCreate(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { courseId, mode, gameType, cardLimit, uploadId } = result.value;

    // Verify the course exists (scan the caller's partition then all)
    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const now = deps.clock.now();
    const nowIso = now.toISOString();

    // Build queue using priority algorithm
    let allCards = await deps.tables.listByPartition<CardRow>("cards", courseId);
    // Filter to specific upload if requested
    if (uploadId) {
      allCards = allCards.filter((c) => c.upload_id === uploadId);
    }
    // MCQ mode: only include cards that have enough distractors for MCQ rendering
    if (mode === "mcq") {
      allCards = allCards.filter((c) => Array.isArray(c.distractors) && c.distractors.length >= 2);
    }
    const queue = buildQueue(allCards, {
      gameType,
      cardLimit,
      now,
      shuffle: deps.random.shuffle.bind(deps.random),
    });

    const sessionId = deps.random.uuid();
    const rowKey = makeSessionRowKey(nowIso, sessionId);

    const sessionRow: SessionRow = {
      partitionKey: auth.auth.userId,
      rowKey,
      user_id: auth.auth.userId,
      course_id: courseId,
      mode,
      game_type: gameType,
      card_limit: cardLimit,
      started_at: nowIso,
      ended_at: null,
      cards_studied: 0,
      cards_correct: 0,
      xp_earned: 0,
      duration_seconds: 0,
    };
    await deps.tables.upsert<SessionRow>("sessions", sessionRow);

    return {
      status: 200,
      jsonBody: {
        sessionId,
        cards: queue.map(cardProfile),
        game_type: gameType,
        card_limit: cardLimit,
        time_limit_seconds: gameType === "speed_round" ? 60 : null,
      },
    };
  };
}

async function findCourseById(
  tables: TableStorage,
  callerUserId: string,
  courseId: string,
): Promise<CourseRow | null> {
  const own = await tables.getById<CourseRow>("courses", callerUserId, courseId);
  if (own) return own;
  const users = await tables.listByPartition<UserRow>("users", PARTITIONS.users);
  for (const u of users) {
    if (u.rowKey === callerUserId) continue;
    const hit = await tables.getById<CourseRow>("courses", u.rowKey, courseId);
    if (hit) return hit;
  }
  return null;
}

/* v8 ignore start */
export function registerSessions(deps: SessionsDeps): void {
  app.http("sessions", {
    route: "sessions",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeSessionsHandler(deps),
  });
}
/* v8 ignore stop */
