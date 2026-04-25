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
import {
  courseProfile,
  deleteCourseAndCascadeCards,
  validateCoursePatch,
  type CourseRow,
} from "./courses-shared.js";

export interface CoursesIdDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

export function makeCoursesIdHandler(deps: CoursesIdDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "PUT").toUpperCase();
    if (method !== "PUT" && method !== "DELETE") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const id = getIdParam(req);
    if (!id) {
      return { status: 400, jsonBody: { error: "missing id path param" } };
    }

    const found = await findCourseAnywhere(deps.tables, auth.auth.userId, id);
    if (!found) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }
    const isOwner = found.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    if (method === "DELETE") {
      await deleteCourseAndCascadeCards(deps.tables, found.user_id, id);
      return { status: 204 };
    }

    const body = await req.json().catch(() => null);
    if (body === null) {
      return { status: 400, jsonBody: { error: "body must be an object" } };
    }
    const result = validateCoursePatch(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { patch } = result;

    const merged: CourseRow = {
      ...found,
      name: patch.name ?? found.name,
      emoji: patch.emoji ?? found.emoji,
      color: patch.color ?? found.color,
      default_mode: patch.default_mode ?? found.default_mode,
      language: patch.language === undefined ? found.language : patch.language,
      question_lang_default: patch.question_lang_default === undefined ? (found.question_lang_default ?? null) : patch.question_lang_default,
      answer_lang_default: patch.answer_lang_default === undefined ? (found.answer_lang_default ?? null) : patch.answer_lang_default,
      bidirectional: patch.bidirectional === undefined ? (found.bidirectional ?? false) : patch.bidirectional,
    };
    await deps.tables.upsert<CourseRow>("courses", merged);

    return { status: 200, jsonBody: courseProfile(merged) };
  };
}

/**
 * Locate a course row by id, scanning first the caller's own partition
 * (the common case) and — only if not found there — every user
 * partition. Used for admin override and cross-user 403 vs 404
 * discrimination.
 */
async function findCourseAnywhere(
  tables: TableStorage,
  ownUserId: string,
  courseId: string,
): Promise<CourseRow | null> {
  const own = await tables.getById<CourseRow>("courses", ownUserId, courseId);
  if (own) return own;
  const users = await tables.listByPartition<UserRow>(
    "users",
    PARTITIONS.users,
  );
  for (const u of users) {
    if (u.rowKey === ownUserId) continue;
    const hit = await tables.getById<CourseRow>(
      "courses",
      u.rowKey,
      courseId,
    );
    if (hit) return hit;
  }
  return null;
}

function getIdParam(req: HttpRequest): string | null {
  const params = (req as unknown as { params?: Record<string, string> }).params;
  const id = params?.id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

/* v8 ignore start */
export function registerCoursesId(deps: CoursesIdDeps): void {
  app.http("courses-id", {
    route: "courses/{id}",
    methods: ["PUT", "DELETE"],
    authLevel: "anonymous",
    handler: makeCoursesIdHandler(deps),
  });
}
/* v8 ignore stop */
