import { buildSessionCookie as buildSessionCookieFor } from "../src/shared/session-cookie.js";

/** Test-side `buildSessionCookie(token)`: a plain-HTTP (non-Secure) session cookie, as the handlers see it locally. */
export function buildSessionCookie(token: string): string {
  return buildSessionCookieFor(token, false);
}
