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
import {
  courseProfile,
  validateCourseCreate,
  type CourseRow,
} from "./courses-shared.js";

export interface CoursesDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
  random: Random;
}

export function makeCoursesHandler(deps: CoursesDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    if (method === "GET") {
      const targetUserId = readQuery(req, "userId") ?? auth.auth.userId;
      const rows = await deps.tables.listByPartition<CourseRow>(
        "courses",
        targetUserId,
      );
      const sorted = [...rows].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      );
      return { status: 200, jsonBody: sorted.map(courseProfile) };
    }

    const body = await req.json().catch(() => null);
    const result = validateCourseCreate(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { value } = result;

    // Invariant 1: user_id always comes from the session, never from the body.
    const ownerUserId = auth.auth.userId;
    const id = deps.random.uuid();
    const row: CourseRow = {
      partitionKey: ownerUserId,
      rowKey: id,
      user_id: ownerUserId,
      year_id: value.year_id,
      name: value.name,
      emoji: value.emoji,
      color: value.color,
      language: value.language,
      question_lang_default: value.question_lang_default,
      answer_lang_default: value.answer_lang_default,
      default_mode: value.default_mode,
      bidirectional: value.bidirectional,
      created_at: deps.clock.now().toISOString(),
    };
    await deps.tables.upsert<CourseRow>("courses", row);

    return { status: 201, jsonBody: courseProfile(row) };
  };
}

function readQuery(req: HttpRequest, name: string): string | null {
  const q = (req as unknown as { query?: { get?: (k: string) => string | null } })
    .query;
  if (!q || typeof q.get !== "function") return null;
  const v = q.get(name);
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* v8 ignore start */
export function registerCourses(deps: CoursesDeps): void {
  app.http("courses", {
    route: "courses",
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: makeCoursesHandler(deps),
  });
}
/* v8 ignore stop */
