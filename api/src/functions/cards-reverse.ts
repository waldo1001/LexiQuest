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
import type { CourseRow } from "./courses-shared.js";
import { buildReverseCard, type CardRow } from "./cards-shared.js";

export interface CardsReverseDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

export function makeCardsReverseHandler(deps: CardsReverseDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "POST").toUpperCase();
    if (method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== "object") {
      return { status: 400, jsonBody: { error: "body must be an object" } };
    }
    const { courseId } = body as Record<string, unknown>;
    if (typeof courseId !== "string" || courseId.trim().length === 0) {
      return { status: 400, jsonBody: { error: "courseId is required" } };
    }

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const cards = await deps.tables.listByPartition<CardRow>("cards", courseId);
    const reverseOfSet = new Set(
      cards.filter((c) => c.reverse_of).map((c) => c.reverse_of!),
    );

    const nowIso = deps.clock.now().toISOString();
    let created = 0;
    let skipped = 0;

    for (const card of cards) {
      // Skip cards that are themselves reverses
      if (card.reverse_of) {
        continue;
      }
      // Skip if already has a reverse
      if (reverseOfSet.has(card.rowKey)) {
        skipped++;
        continue;
      }
      const rev = buildReverseCard(card, { id: deps.random.uuid(), nowIso });
      await deps.tables.upsert<CardRow>("cards", rev);
      created++;
    }

    return { status: 200, jsonBody: { created, skipped } };
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
export function registerCardsReverse(deps: CardsReverseDeps): void {
  app.http("cards-reverse", {
    route: "cards/reverse",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsReverseHandler(deps),
  });
}
/* v8 ignore stop */
