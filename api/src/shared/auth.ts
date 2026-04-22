import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { readSessionCookie } from "./session-cookie.js";
import type { SessionSigner } from "./session-signer.js";

export interface AuthOk {
  ok: true;
  auth: { userId: string; isAdmin: boolean };
}

export interface AuthFailed {
  ok: false;
  response: HttpResponseInit;
}

export type AuthResult = AuthOk | AuthFailed;

const UNAUTHORIZED: HttpResponseInit = {
  status: 401,
  jsonBody: { error: "unauthorized" },
};

function getCookieHeader(req: HttpRequest): string | null {
  const headers = req.headers;
  if (!headers) return null;
  // Azure Functions v4 exposes headers via .get(name) which is
  // case-insensitive; fall back to record-ish access otherwise.
  const get = (headers as { get?: (k: string) => string | null }).get;
  if (typeof get === "function") {
    return get.call(headers, "cookie");
  }
  const rec = headers as unknown as Record<string, string | undefined>;
  return rec.cookie ?? rec.Cookie ?? null;
}

export function requireAuth(
  req: HttpRequest,
  deps: { signer: SessionSigner },
): AuthResult {
  const cookieHeader = getCookieHeader(req);
  const token = readSessionCookie(cookieHeader);
  if (!token) return { ok: false, response: UNAUTHORIZED };
  const payload = deps.signer.verify(token);
  if (!payload) return { ok: false, response: UNAUTHORIZED };
  return {
    ok: true,
    auth: { userId: payload.userId, isAdmin: payload.isAdmin },
  };
}
