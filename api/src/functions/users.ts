import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";

export interface UsersDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

function fullProfile(user: UserRow) {
  return {
    id: user.rowKey,
    name: user.name,
    isAdmin: user.is_admin,
    color: user.color,
    avatar_emoji: user.avatar_emoji,
    ui_language: user.ui_language,
    settings: user.settings,
    created_at: user.created_at,
  };
}

export function makeUsersHandler(deps: UsersDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    const sorted = rows
      .map(fullProfile)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    return { status: 200, jsonBody: sorted };
  };
}

/* v8 ignore start */
export function registerUsers(deps: UsersDeps): void {
  app.http("users", {
    route: "users",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeUsersHandler(deps),
  });
}
/* v8 ignore stop */
