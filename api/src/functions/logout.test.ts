import { describe, it, expect } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { logoutHandler } from "./logout.js";
import { SESSION_COOKIE_NAME } from "../shared/session-cookie.js";

const req = {} as HttpRequest;
const ctx = {} as InvocationContext;

describe("POST /api/logout", () => {
  it("returns 204 and a cleared cookie", async () => {
    const res = (await logoutHandler(req, ctx)) as HttpResponseInit;
    expect(res.status).toBe(204);
    const cookie = (res.headers as Record<string, string>)["Set-Cookie"];
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });

  it("is idempotent — no state inspected, always 204", async () => {
    const a = (await logoutHandler(req, ctx)) as HttpResponseInit;
    const b = (await logoutHandler(req, ctx)) as HttpResponseInit;
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });
});
