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
import type { ClaudeClient } from "../shared/claude.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";

export interface CardsEnrichDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  claude: ClaudeClient;
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

export function makeCardsEnrichHandler(deps: CardsEnrichDeps): HttpHandler {
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
    const src = body as Record<string, unknown>;
    if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
      return { status: 400, jsonBody: { error: "courseId is required" } };
    }
    const courseId = src.courseId.trim();

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    // Fetch all cards in this course; filter to those missing distractors
    const allCards = await deps.tables.listByPartition<CardRow>("cards", courseId);
    const needEnrich = allCards.filter(
      (c) => !c.distractors || c.distractors.length === 0,
    );

    if (needEnrich.length === 0) {
      return { status: 200, jsonBody: { enriched: 0 } };
    }

    try {
      const enrichResults = await deps.claude.enrichDistractors({
        cards: needEnrich.map((c) => ({
          id: c.rowKey,
          question: c.question,
          answer: c.answer,
        })),
      });

      // Build a lookup map from id → distractors
      const resultMap = new Map(enrichResults.map((r) => [r.id, r.distractors]));

      let enriched = 0;
      for (const card of needEnrich) {
        const distractors = resultMap.get(card.rowKey);
        if (distractors) {
          await deps.tables.upsert<CardRow>("cards", {
            ...card,
            distractors,
          });
          enriched += 1;
        }
      }

      return { status: 200, jsonBody: { enriched } };
    } catch {
      return { status: 502, jsonBody: { error: "Claude request failed" } };
    }
  };
}

/* v8 ignore start */
export function registerCardsEnrich(deps: CardsEnrichDeps): void {
  app.http("cards-enrich", {
    route: "cards/enrich",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsEnrichHandler(deps),
  });
}
/* v8 ignore stop */
