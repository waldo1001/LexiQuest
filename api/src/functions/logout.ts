import {
  app,
  type HttpHandler,
  type HttpResponseInit,
} from "@azure/functions";
import { buildClearedSessionCookie } from "../shared/session-cookie.js";

export const logoutHandler: HttpHandler = async (): Promise<HttpResponseInit> => ({
  status: 204,
  headers: { "Set-Cookie": buildClearedSessionCookie() },
});

/* v8 ignore start */
export function registerLogout(): void {
  app.http("logout", {
    route: "logout",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: logoutHandler,
  });
}
/* v8 ignore stop */
