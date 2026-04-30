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
import { findExistingUpload, type CardRow } from "./cards-shared.js";

export interface CardsCopyDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

interface ValidatedBody {
  courseId: string;
  sourceUploadId: string;
  targetUploadId: string;
}

function validateBody(body: unknown): { ok: true; value: ValidatedBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }
  if (typeof src.sourceUploadId !== "string" || src.sourceUploadId.trim().length === 0) {
    return { ok: false, error: "sourceUploadId is required" };
  }
  if (typeof src.targetUploadId !== "string" || src.targetUploadId.trim().length === 0) {
    return { ok: false, error: "targetUploadId is required" };
  }
  const courseId = src.courseId.trim();
  const sourceUploadId = src.sourceUploadId.trim();
  const targetUploadId = src.targetUploadId.trim();
  if (sourceUploadId === targetUploadId) {
    return { ok: false, error: "sourceUploadId and targetUploadId must differ" };
  }
  return { ok: true, value: { courseId, sourceUploadId, targetUploadId } };
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

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function makeCardsCopyHandler(deps: CardsCopyDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "POST").toUpperCase();
    if (method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const validated = validateBody(body);
    if (!validated.ok) {
      return { status: 400, jsonBody: { error: validated.error } };
    }
    const { courseId, sourceUploadId, targetUploadId } = validated.value;

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const sourceUpload = await findExistingUpload(deps.tables, courseId, sourceUploadId);
    if (!sourceUpload) {
      return { status: 400, jsonBody: { error: "sourceUploadId does not match any upload in this course" } };
    }
    const targetUpload = await findExistingUpload(deps.tables, courseId, targetUploadId);
    if (!targetUpload) {
      return { status: 400, jsonBody: { error: "targetUploadId does not match any upload in this course" } };
    }

    const allCards = await deps.tables.listByPartition<CardRow>("cards", courseId);
    const seen = new Set<string>();
    for (const c of allCards) {
      if (c.upload_id === targetUploadId) {
        seen.add(normalizeQuestion(c.question));
      }
    }
    const sourceForwards = allCards.filter(
      (c) => c.upload_id === sourceUploadId && (c.reverse_of ?? null) === null,
    );

    const nowIso = deps.clock.now().toISOString();
    const copied_card_ids: string[] = [];
    let skipped = 0;

    for (const src of sourceForwards) {
      const key = normalizeQuestion(src.question);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      const newId = deps.random.uuid();
      const row: CardRow = {
        partitionKey: courseId,
        rowKey: newId,
        course_id: courseId,
        question: src.question,
        answer: src.answer,
        distractors: Array.isArray(src.distractors) ? [...src.distractors] : [],
        hint: src.hint ?? null,
        source: src.source,
        sm2_ease: 2.5,
        sm2_interval: 0,
        sm2_reps: 0,
        next_review_at: nowIso,
        created_at: nowIso,
        upload_id: targetUploadId,
        upload_name: targetUpload.uploadName,
        question_lang: src.question_lang ?? null,
        answer_lang: src.answer_lang ?? null,
        reverse_of: null,
      };
      await deps.tables.upsert<CardRow>("cards", row);
      copied_card_ids.push(newId);
    }

    return {
      status: 201,
      jsonBody: { copied: copied_card_ids.length, skipped, copied_card_ids },
    };
  };
}

/* v8 ignore start */
export function registerCardsCopy(deps: CardsCopyDeps): void {
  app.http("cards-copy", {
    route: "cards/copy",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsCopyHandler(deps),
  });
}
/* v8 ignore stop */
