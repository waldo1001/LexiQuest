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
import {
  cardProfile,
  validateCardPatch,
  type CardRow,
} from "./cards-shared.js";

export interface CardsIdDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeCardsIdHandler(deps: CardsIdDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "PUT").toUpperCase();
    if (method !== "PUT" && method !== "DELETE") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const id = getPathParam(req, "id");
    if (!id) {
      return { status: 400, jsonBody: { error: "missing id path param" } };
    }

    const courseId = readQuery(req, "courseId");
    if (!courseId) {
      return { status: 400, jsonBody: { error: "courseId query param is required" } };
    }

    // Find the card
    const card = await deps.tables.getById<CardRow>("cards", courseId, id);
    if (!card) {
      return { status: 404, jsonBody: { error: "card not found" } };
    }

    // Find the course to verify ownership
    const course = await findCourseById(deps.tables, auth.auth.userId, courseId);
    if (!course) {
      return { status: 404, jsonBody: { error: "course not found" } };
    }

    const isOwner = course.user_id === auth.auth.userId;
    if (!isOwner && !auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    if (method === "DELETE") {
      await deps.tables.remove("cards", courseId, id);
      return { status: 204 };
    }

    // PUT
    const body = await req.json().catch(() => null);
    if (body === null) {
      return { status: 400, jsonBody: { error: "body must be an object" } };
    }
    const result = validateCardPatch(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { patch } = result;

    const merged: CardRow = {
      ...card,
      question: patch.question ?? card.question,
      answer: patch.answer ?? card.answer,
      hint: patch.hint === undefined ? card.hint : patch.hint,
      distractors: patch.distractors ?? card.distractors,
    };
    await deps.tables.upsert<CardRow>("cards", merged);

    return { status: 200, jsonBody: cardProfile(merged) };
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

function getPathParam(req: HttpRequest, name: string): string | null {
  const params = (req as unknown as { params?: Record<string, string> }).params;
  const v = params?.[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readQuery(req: HttpRequest, name: string): string | null {
  const q = (req as unknown as { query?: { get?: (k: string) => string | null } }).query;
  if (!q || typeof q.get !== "function") return null;
  const v = q.get(name);
  return typeof v === "string" && v.length > 0 ? v : null;
}

/* v8 ignore start */
export function registerCardsId(deps: CardsIdDeps): void {
  app.http("cards-id", {
    route: "cards/{id}",
    methods: ["PUT", "DELETE"],
    authLevel: "anonymous",
    handler: makeCardsIdHandler(deps),
  });
}
/* v8 ignore stop */
