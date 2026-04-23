import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { Clock } from "../shared/clock.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import type { UserRow } from "../shared/seed.js";
import type { CourseRow } from "./courses-shared.js";
import type { CardRow } from "./cards-shared.js";
import type { SessionRow } from "./sessions-shared.js";
import type { AttemptRow } from "./attempts-shared.js";

export interface ExportDeps {
  tables: TableStorage;
  signer: SessionSigner;
  clock: Clock;
}

export function makeExportHandler(deps: ExportDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    /* v8 ignore next */
    if ((req.method ?? "GET").toUpperCase() !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;
    const { userId: callerId, isAdmin } = auth.auth;

    const query = req.query as { get(k: string): string | null };
    const requestedUserId = query.get("userId");

    let targetUserId = callerId;
    if (requestedUserId && requestedUserId !== callerId) {
      if (!isAdmin) {
        return { status: 403, jsonBody: { error: "forbidden" } };
      }
      targetUserId = requestedUserId;
    }

    const userRow = await deps.tables.getById<UserRow>("users", PARTITIONS.users, targetUserId);
    if (!userRow) {
      return { status: 404, jsonBody: { error: "user not found" } };
    }

    const { password_hash: _omit, ...safeUser } = userRow;
    const exportUser = { ...safeUser, userId: targetUserId };

    const courses = await deps.tables.listByPartition<CourseRow>("courses", targetUserId);
    const cards = (
      await Promise.all(courses.map((c) => deps.tables.listByPartition<CardRow>("cards", c.rowKey)))
    ).flat();
    const sessions = await deps.tables.listByPartition<SessionRow>("sessions", targetUserId);
    const attempts = await deps.tables.listByPartition<AttemptRow>("attempts", targetUserId);

    /* v8 ignore next */
    const safeName = (userRow.name ?? "user").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = deps.clock.now().toISOString().slice(0, 10);
    const filename = `lexiquest-${safeName}-${dateStr}.json`;

    return {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=${filename}`,
        "Content-Type": "application/json",
      },
      jsonBody: { user: exportUser, courses, cards, sessions, attempts },
    };
  };
}

/* v8 ignore start */
export function registerExport(deps: ExportDeps): void {
  app.http("export", {
    route: "export",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeExportHandler(deps),
  });
}
/* v8 ignore stop */
