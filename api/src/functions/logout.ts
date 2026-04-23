import {
  app,
  type HttpHandler,
  type HttpResponseInit,
} from "@azure/functions";
import { buildClearedSessionCookie } from "../shared/session-cookie.js";

export interface LogoutDeps {
  cookieSecure: boolean;
}

export function makeLogoutHandler(deps: LogoutDeps): HttpHandler {
  return async (): Promise<HttpResponseInit> => ({
    status: 204,
    headers: { "Set-Cookie": buildClearedSessionCookie(deps.cookieSecure) },
  });
}

/* v8 ignore start */
export function registerLogout(deps: LogoutDeps): void {
  app.http("logout", {
    route: "logout",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: makeLogoutHandler(deps),
  });
}
/* v8 ignore stop */
