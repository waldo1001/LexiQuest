import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { Clock } from "../shared/clock.js";
import type { PasswordHasher } from "../shared/password-hasher.js";
import type { Random } from "../shared/random.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";
import { fullProfile, validateUserCreate } from "./users-shared.js";

export interface UsersDeps {
  tables: TableStorage;
  signer: SessionSigner;
  hasher: PasswordHasher;
  random: Random;
  clock: Clock;
}

export function makeUsersHandler(deps: UsersDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    if (method === "GET") {
      const rows = await deps.tables.listByPartition<UserRow>("users", "users");
      const sorted = rows
        .map(fullProfile)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return { status: 200, jsonBody: sorted };
    }

    // POST — admin-only create
    if (!auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const body = await req.json().catch(() => null);
    const result = validateUserCreate(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { value } = result;

    const existing = await deps.tables.listByPartition<UserRow>(
      "users",
      "users",
    );
    if (existing.some((u) => u.name === value.name)) {
      return { status: 409, jsonBody: { error: "name already exists" } };
    }

    const password_hash = await deps.hasher.hash(value.password);
    const row: UserRow = {
      partitionKey: "users",
      rowKey: deps.random.uuid(),
      name: value.name,
      password_hash,
      is_admin: value.is_admin,
      color: value.color,
      avatar_emoji: value.avatar_emoji,
      ui_language: value.ui_language,
      settings: {
        auto_speak: value.settings?.auto_speak ?? true,
        preferred_mode: value.settings?.preferred_mode ?? "ask",
        daily_goal: value.settings?.daily_goal ?? 20,
      },
      created_at: deps.clock.now().toISOString(),
    };
    await deps.tables.upsert<UserRow>("users", row);

    return { status: 201, jsonBody: fullProfile(row) };
  };
}

/* v8 ignore start */
export function registerUsers(deps: UsersDeps): void {
  app.http("users", {
    route: "users",
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: makeUsersHandler(deps),
  });
}
/* v8 ignore stop */
