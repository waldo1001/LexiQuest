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

export interface MeDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

export function makeMeHandler(deps: MeDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    const user = await deps.tables.getById<UserRow>(
      "users",
      "users",
      auth.auth.userId,
    );
    if (!user) return { status: 404, jsonBody: { error: "user not found" } };

    return {
      status: 200,
      jsonBody: {
        id: user.rowKey,
        name: user.name,
        isAdmin: user.is_admin,
        color: user.color,
        avatar_emoji: user.avatar_emoji,
        ui_language: user.ui_language,
        settings: user.settings,
      },
    };
  };
}

/* v8 ignore start */
export function registerMe(deps: MeDeps): void {
  app.http("me", {
    route: "me",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeMeHandler(deps),
  });
}
/* v8 ignore stop */
