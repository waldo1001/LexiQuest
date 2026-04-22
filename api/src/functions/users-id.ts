import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { PasswordHasher } from "../shared/password-hasher.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { UserRow } from "../shared/seed.js";
import { deleteUserAndCascade } from "./user-cascade.js";
import {
  fullProfile,
  validateUserPatch,
} from "./users-shared.js";

export interface UsersIdDeps {
  tables: TableStorage;
  signer: SessionSigner;
  hasher: PasswordHasher;
}

export function makeUsersIdHandler(deps: UsersIdDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "PUT" && method !== "DELETE") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;
    if (!auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const id = getIdParam(req);
    if (!id) {
      return { status: 400, jsonBody: { error: "missing id path param" } };
    }

    const existing = await deps.tables.getById<UserRow>("users", "users", id);
    if (!existing) {
      return { status: 404, jsonBody: { error: "user not found" } };
    }

    if (method === "DELETE") {
      if (id === auth.auth.userId) {
        return {
          status: 403,
          jsonBody: { error: "cannot delete your own user" },
        };
      }
      await deleteUserAndCascade(deps, id);
      return { status: 204 };
    }

    const body = await req.json().catch(() => ({}));
    const result = validateUserPatch(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { patch } = result;

    let password_hash = existing.password_hash;
    if (patch.password !== undefined) {
      password_hash = await deps.hasher.hash(patch.password);
    }

    const merged: UserRow = {
      ...existing,
      name: patch.name ?? existing.name,
      color: patch.color ?? existing.color,
      avatar_emoji: patch.avatar_emoji ?? existing.avatar_emoji,
      is_admin: patch.is_admin ?? existing.is_admin,
      ui_language: patch.ui_language ?? existing.ui_language,
      settings: patch.settings
        ? { ...existing.settings, ...patch.settings }
        : existing.settings,
      password_hash,
    };
    await deps.tables.upsert<UserRow>("users", merged);

    return { status: 200, jsonBody: fullProfile(merged) };
  };
}

function getIdParam(req: HttpRequest): string | null {
  const params = (req as unknown as { params?: Record<string, string> }).params;
  const id = params?.id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

/* v8 ignore start */
export function registerUsersId(deps: UsersIdDeps): void {
  app.http("users-id", {
    route: "users/{id}",
    methods: ["PUT", "DELETE"],
    authLevel: "anonymous",
    handler: makeUsersIdHandler(deps),
  });
}
/* v8 ignore stop */
