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
import type { ClaudeClient, ExtractCardsInput } from "../shared/claude.js";
import { ClaudeJsonParseError } from "../shared/claude.js";
import type { CourseRow } from "./courses-shared.js";

export interface CardsImportDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  claude: ClaudeClient;
}

const VALID_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function validateBody(
  body: unknown,
): { ok: true; courseId: string; imageBase64: string; mimeType: ExtractCardsInput["mimeType"] } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.courseId !== "string" || src.courseId.trim().length === 0) {
    return { ok: false, error: "courseId is required" };
  }
  if (typeof src.imageBase64 !== "string" || src.imageBase64.length === 0) {
    return { ok: false, error: "imageBase64 is required" };
  }
  if (typeof src.mimeType !== "string" || !VALID_MIME_TYPES.has(src.mimeType)) {
    return { ok: false, error: "mimeType must be image/jpeg, image/png, image/webp, or image/gif" };
  }
  return {
    ok: true,
    courseId: src.courseId.trim(),
    imageBase64: src.imageBase64,
    mimeType: src.mimeType as ExtractCardsInput["mimeType"],
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

export function makeCardsImportHandler(deps: CardsImportDeps): HttpHandler {
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
    const { courseId, imageBase64, mimeType } = validated;

    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    // Fetch caller's ui_language — fall back to "en" if row not found
    const userRow = await deps.tables.getById<UserRow>("users", PARTITIONS.users, auth.auth.userId);
    const uiLanguage = userRow?.ui_language ?? "en";

    try {
      const candidates = await deps.claude.extractCards({
        imageBase64,
        mimeType,
        courseName: course.name,
        courseLanguage: course.language,
        uiLanguage,
      });
      return { status: 200, jsonBody: { candidates } };
    } catch (err) {
      if (err instanceof ClaudeJsonParseError) {
        return { status: 422, jsonBody: { error: "Claude returned unparseable JSON", raw: err.raw } };
      }
      return { status: 502, jsonBody: { error: "Claude request failed" } };
    }
  };
}

/* v8 ignore start */
export function registerCardsImport(deps: CardsImportDeps): void {
  app.http("cards-import", {
    route: "cards/import",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeCardsImportHandler(deps),
  });
}
/* v8 ignore stop */
