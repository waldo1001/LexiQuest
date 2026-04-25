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
import {
  cardProfile,
  validateCardCreate,
  type CardRow,
} from "./cards-shared.js";

export interface CardsDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

export function makeCardsHandler(deps: CardsDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    if (method === "GET") {
      const courseId = readQuery(req, "courseId");
      if (!courseId) {
        return { status: 400, jsonBody: { error: "courseId query param is required" } };
      }
      const rows = await deps.tables.listByPartition<CardRow>("cards", courseId);
      return { status: 200, jsonBody: rows.map(cardProfile) };
    }

    // POST
    const body = await req.json().catch(() => null);
    const result = validateCardCreate(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { value } = result;

    // Find the course — scan caller's partition first, then all users
    const course = await findCourseById(deps.tables, auth.auth.userId, value.course_id);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const nowIso = deps.clock.now().toISOString();
    const id = deps.random.uuid();
    const row: CardRow = {
      partitionKey: value.course_id,
      rowKey: id,
      course_id: value.course_id,
      question: value.question,
      answer: value.answer,
      distractors: value.distractors ?? [],
      hint: value.hint ?? null,
      source: value.source ?? "manual",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: nowIso,
      created_at: nowIso,
      upload_id: null,
      question_lang: value.question_lang ?? null,
      answer_lang: value.answer_lang ?? null,
      reverse_of: null,
    };
    await deps.tables.upsert<CardRow>("cards", row);

    return { status: 201, jsonBody: cardProfile(row) };
  };
}

/**
 * Find a course by its id (= rowKey), scanning the caller's own partition
 * first (the common case) then all user partitions. Mirrors the
 * findCourseAnywhere pattern in courses-id.ts.
 */
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

function readQuery(req: HttpRequest, name: string): string | null {
  const q = (req as unknown as { query?: { get?: (k: string) => string | null } }).query;
  if (!q || typeof q.get !== "function") return null;
  const v = q.get(name);
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* v8 ignore start */
export function registerCards(deps: CardsDeps): void {
  app.http("cards", {
    route: "cards",
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: makeCardsHandler(deps),
  });
}
/* v8 ignore stop */
