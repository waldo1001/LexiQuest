import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import type { Clock } from "../shared/clock.js";
import type { Logger } from "../shared/logger.js";
import type { PasswordHasher } from "../shared/password-hasher.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import {
  SESSION_MAX_AGE_SECONDS,
  buildSessionCookie,
} from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

export interface LoginDeps {
  tables: TableStorage;
  hasher: PasswordHasher;
  signer: SessionSigner;
  clock: Clock;
  logger: Logger;
  cookieSecure: boolean;
}

const GENERIC_401 = { error: "invalid credentials" };

export function makeLoginHandler(deps: LoginDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const body = (await req.json().catch(() => null)) as
      | { userId?: unknown; password?: unknown }
      | null;

    if (
      !body ||
      typeof body.userId !== "string" ||
      typeof body.password !== "string" ||
      body.userId.length === 0 ||
      body.password.length === 0
    ) {
      return { status: 400, jsonBody: { error: "missing userId or password" } };
    }

    const user = await deps.tables.getById<UserRow>(
      "users",
      "users",
      body.userId,
    );
    if (!user) {
      deps.logger.info("login_failed", { userId: body.userId, reason: "unknown_user" });
      return { status: 401, jsonBody: GENERIC_401 };
    }

    const ok = await deps.hasher.verify(body.password, user.password_hash);
    if (!ok) {
      deps.logger.info("login_failed", { userId: body.userId, reason: "bad_password" });
      return { status: 401, jsonBody: GENERIC_401 };
    }

    const token = deps.signer.sign({
      userId: user.rowKey,
      isAdmin: user.is_admin,
      expMs: deps.clock.nowMs() + SESSION_MAX_AGE_SECONDS * 1000,
    });

    deps.logger.info("login_success", { userId: user.rowKey });

    return {
      status: 200,
      headers: { "Set-Cookie": buildSessionCookie(token, deps.cookieSecure) },
      jsonBody: {
        id: user.rowKey,
        name: user.name,
        isAdmin: user.is_admin,
        ui_language: user.ui_language,
      },
    };
  };
}

/* v8 ignore start */
// Registration — wired from the real composition root (future slice).
// Not executed in tests.
export function registerLogin(deps: LoginDeps): void {
  app.http("login", {
    route: "login",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeLoginHandler(deps),
  });
}
/* v8 ignore stop */
