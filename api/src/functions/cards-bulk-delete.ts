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
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";

export interface CardsBulkDeleteDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

type Selector =
  | { kind: "uploadId"; uploadId: string }
  | { kind: "ids"; ids: string[] }
  | { kind: "all" };

function validateBody(
  body: unknown,
):
  | { ok: true; courseId: string; selector: Selector }
  | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }

  const hasUploadId = typeof src.uploadId === "string" && src.uploadId.length > 0;
  const hasIds = Array.isArray(src.ids);
  const hasAll = src.all !== undefined;

  const selectorCount = (hasUploadId ? 1 : 0) + (hasIds ? 1 : 0) + (hasAll ? 1 : 0);
  if (selectorCount === 0) {
    return { ok: false, error: "exactly one of {uploadId, ids, all} is required" };
  }
  if (selectorCount > 1) {
    return { ok: false, error: "only one of {uploadId, ids, all} may be set" };
  }

  if (hasUploadId) {
    return {
      ok: true,
      courseId: src.courseId.trim(),
      selector: { kind: "uploadId", uploadId: src.uploadId as string },
    };
  }

  if (hasIds) {
    const ids = src.ids as unknown[];
    if (ids.length === 0) {
      return { ok: false, error: "ids must not be empty" };
    }
    for (const v of ids) {
      if (typeof v !== "string" || v.length === 0) {
        return { ok: false, error: "ids must be non-empty strings" };
      }
    }
    return {
      ok: true,
      courseId: src.courseId.trim(),
      selector: { kind: "ids", ids: ids as string[] },
    };
  }

  // hasAll
  if (src.all !== true) {
    return { ok: false, error: "all must be true" };
  }
  return {
    ok: true,
    courseId: src.courseId.trim(),
    selector: { kind: "all" },
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

export function makeCardsBulkDeleteHandler(deps: CardsBulkDeleteDeps): HttpHandler {
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
    const { courseId, selector } = validated;

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    let toDelete: string[];
    if (selector.kind === "all") {
      const rows = await deps.tables.listByPartition<CardRow>("cards", courseId);
      toDelete = rows.map((r) => r.rowKey);
    } else if (selector.kind === "uploadId") {
      const rows = await deps.tables.listByPartition<CardRow>("cards", courseId);
      toDelete = rows
        .filter((r) => (r.upload_id ?? null) === selector.uploadId)
        .map((r) => r.rowKey);
    } else {
      // ids — filter to those that actually exist in this course's partition
      const rows = await deps.tables.listByPartition<CardRow>("cards", courseId);
      const existing = new Set(rows.map((r) => r.rowKey));
      toDelete = selector.ids.filter((id) => existing.has(id));
    }

    for (const id of toDelete) {
      await deps.tables.remove("cards", courseId, id);
    }

    return { status: 200, jsonBody: { deleted: toDelete.length } };
  };
}

/* v8 ignore start */
export function registerCardsBulkDelete(deps: CardsBulkDeleteDeps): void {
  app.http("cards-bulk-delete", {
    route: "cards/bulk-delete",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsBulkDeleteHandler(deps),
  });
}
/* v8 ignore stop */
