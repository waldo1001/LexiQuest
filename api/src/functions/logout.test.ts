import { describe, it, expect } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeLogoutHandler } from "./logout.js";
import { SESSION_COOKIE_NAME } from "../shared/session-cookie.js";

const req = {} as HttpRequest;
const ctx = {} as InvocationContext;

describe("POST /api/logout", () => {
  it("returns 204 and a cleared cookie with Secure when cookieSecure=true", async () => {
    const handler = makeLogoutHandler({ cookieSecure: true });
    const res = (await handler(req, ctx)) as HttpResponseInit;
    expect(res.status).toBe(204);
    const cookie = (res.headers as Record<string, string>)["Set-Cookie"];
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("omits Secure when cookieSecure=false (local dev over HTTP)", async () => {
    const handler = makeLogoutHandler({ cookieSecure: false });
    const res = (await handler(req, ctx)) as HttpResponseInit;
    const cookie = (res.headers as Record<string, string>)["Set-Cookie"];
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=0");
  });

  it("is idempotent — no state inspected, always 204", async () => {
    const handler = makeLogoutHandler({ cookieSecure: true });
    const a = (await handler(req, ctx)) as HttpResponseInit;
    const b = (await handler(req, ctx)) as HttpResponseInit;
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });
});
