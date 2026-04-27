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
import { buildReverseCard, cardProfile, findExistingUpload, type CardRow } from "./cards-shared.js";

export interface CardsBatchDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

interface BatchCardInput {
  question: string;
  answer: string;
  distractors?: string[];
  hint?: string | null;
  question_lang?: string | null;
  answer_lang?: string | null;
}

function validateBody(
  body: unknown,
): { ok: true; courseId: string; cards: BatchCardInput[]; bidirectional: boolean; uploadName: string | null; uploadId: string | null } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }
  if (!Array.isArray(src.cards)) {
    return { ok: false, error: "cards must be an array" };
  }
  if (src.cards.length === 0) {
    return { ok: false, error: "cards must not be empty" };
  }
  for (const c of src.cards as unknown[]) {
    if (typeof (c as Record<string, unknown>).question !== "string") {
      return { ok: false, error: "each card must have a question" };
    }
    if (typeof (c as Record<string, unknown>).answer !== "string") {
      return { ok: false, error: "each card must have an answer" };
    }
  }
  const bidirectional = src.bidirectional === true;
  const uploadName = typeof src.uploadName === "string" && src.uploadName.trim().length > 0
    ? src.uploadName.trim()
    : null;

  let uploadId: string | null = null;
  if (src.uploadId !== undefined && src.uploadId !== null) {
    if (typeof src.uploadId !== "string" || src.uploadId.trim().length === 0) {
      return { ok: false, error: "uploadId must be a non-empty string" };
    }
    uploadId = src.uploadId.trim();
  }
  if (uploadId !== null && uploadName !== null) {
    return { ok: false, error: "uploadId and uploadName are mutually exclusive" };
  }

  return { ok: true, courseId: src.courseId.trim(), cards: src.cards as BatchCardInput[], bidirectional, uploadName, uploadId };
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

export function makeCardsBatchHandler(deps: CardsBatchDeps): HttpHandler {
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
    const { courseId, cards, bidirectional, uploadName, uploadId: requestedUploadId } = validated;

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    let uploadId: string;
    let resolvedUploadName: string | null;
    if (requestedUploadId) {
      const existing = await findExistingUpload(deps.tables, courseId, requestedUploadId);
      if (!existing) {
        return { status: 400, jsonBody: { error: "uploadId does not match any upload in this course" } };
      }
      uploadId = existing.uploadId;
      resolvedUploadName = existing.uploadName;
    } else {
      uploadId = deps.random.uuid();
      resolvedUploadName = uploadName;
    }

    const nowIso = deps.clock.now().toISOString();
    const created: CardRow[] = [];

    for (const input of cards) {
      const id = deps.random.uuid();
      const row: CardRow = {
        partitionKey: courseId,
        rowKey: id,
        course_id: courseId,
        question: input.question,
        answer: input.answer,
        distractors: Array.isArray(input.distractors) ? input.distractors : [],
        hint: input.hint ?? null,
        source: "ai_import",
        sm2_ease: 2.5,
        sm2_interval: 0,
        sm2_reps: 0,
        next_review_at: nowIso,
        created_at: nowIso,
        upload_id: uploadId,
        upload_name: resolvedUploadName,
        question_lang: input.question_lang ?? null,
        answer_lang: input.answer_lang ?? null,
        reverse_of: null,
      };
      await deps.tables.upsert<CardRow>("cards", row);
      created.push(row);

      if (bidirectional) {
        const rev = buildReverseCard(row, { id: deps.random.uuid(), nowIso });
        await deps.tables.upsert<CardRow>("cards", rev);
        created.push(rev);
      }
    }

    return {
      status: 201,
      jsonBody: { upload_id: uploadId, cards: created.map(cardProfile) },
    };
  };
}

export function makeUploadRenameHandler(deps: CardsBatchDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    if ((req.method ?? "PATCH").toUpperCase() !== "PATCH") {
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
    if (typeof src.uploadId !== "string" || src.uploadId.trim().length === 0) {
      return { status: 400, jsonBody: { error: "uploadId is required" } };
    }
    if (typeof src.uploadName !== "string" || src.uploadName.trim().length === 0) {
      return { status: 400, jsonBody: { error: "uploadName is required" } };
    }

    const courseId = src.courseId.trim();
    const uploadId = src.uploadId.trim();
    const uploadName = src.uploadName.trim();

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }
    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const allCards = await deps.tables.listByPartition<CardRow>("cards", courseId);
    const matching = allCards.filter((c) => c.upload_id === uploadId);
    for (const card of matching) {
      card.upload_name = uploadName;
      await deps.tables.upsert<CardRow>("cards", card);
    }

    return { status: 200, jsonBody: { updated: matching.length } };
  };
}

/* v8 ignore start */
export function registerCardsBatch(deps: CardsBatchDeps): void {
  app.http("cards-batch", {
    route: "cards/batch",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsBatchHandler(deps),
  });
  app.http("cards-upload-rename", {
    route: "cards/upload-name",
    methods: ["PATCH"],
    authLevel: "anonymous",
    handler: makeUploadRenameHandler(deps),
  });
}
/* v8 ignore stop */
