import {
  app,
  type HttpHandler,
  type HttpResponseInit,
} from "@azure/functions";
import type { TableStorage } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";

export interface UsersPublicDeps {
  tables: TableStorage;
}

export function makeUsersPublicHandler(
  deps: UsersPublicDeps,
): HttpHandler {
  return async (): Promise<HttpResponseInit> => {
    const rows = await deps.tables.listByPartition<UserRow>("users", "users");
    const projected = rows
      .filter((r) => r.is_admin !== true)
      .map((r) => ({
        id: r.rowKey,
        name: r.name,
        avatar_emoji: r.avatar_emoji,
        color: r.color,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { status: 200, jsonBody: projected };
  };
}

/* v8 ignore start */
export function registerUsersPublic(deps: UsersPublicDeps): void {
  app.http("users-public", {
    route: "users/public",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: makeUsersPublicHandler(deps),
  });
}
/* v8 ignore stop */
