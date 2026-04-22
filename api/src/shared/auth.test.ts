import { describe, it, expect } from "vitest";
import type { HttpRequest } from "@azure/functions";
import { requireAuth } from "./auth.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "./session-cookie.js";

function reqWithCookie(cookie: string | null): HttpRequest {
  const headers = {
    get(name: string): string | null {
      return name.toLowerCase() === "cookie" ? cookie : null;
    },
  };
  return { headers } as unknown as HttpRequest;
}

function reqWithRecordHeaders(cookie: string | null): HttpRequest {
  return {
    headers: { cookie },
  } as unknown as HttpRequest;
}

describe("requireAuth", () => {
  const clock = new FakeClock("2026-04-22T09:00:00Z");
  const signer = new FakeSessionSigner(clock);
  const deps = { signer };

  it("returns 401 when no cookie is present", () => {
    const r = requireAuth(reqWithCookie(null), deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("returns 401 when the cookie is tampered", () => {
    const token = signer.sign({
      userId: "u1",
      isAdmin: false,
      expMs: clock.nowMs() + 60_000,
    });
    const bad = token.replace(/^.{5}/, "xxxxx");
    const cookie = buildSessionCookie(bad);
    const r = requireAuth(reqWithCookie(cookie), deps);
    expect(r.ok).toBe(false);
  });

  it("returns { userId, isAdmin } on a valid cookie", () => {
    const token = signer.sign({
      userId: "u-alice",
      isAdmin: true,
      expMs: clock.nowMs() + 60_000,
    });
    const cookie = buildSessionCookie(token);
    const r = requireAuth(reqWithCookie(cookie), deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.auth).toEqual({ userId: "u-alice", isAdmin: true });
    }
  });

  it("works with record-style headers (no .get)", () => {
    const token = signer.sign({
      userId: "u-bob",
      isAdmin: false,
      expMs: clock.nowMs() + 60_000,
    });
    const cookie = buildSessionCookie(token);
    const r = requireAuth(reqWithRecordHeaders(cookie), deps);
    expect(r.ok).toBe(true);
  });

  it("returns 401 with no headers at all", () => {
    const r = requireAuth({} as HttpRequest, deps);
    expect(r.ok).toBe(false);
  });

  it("falls back to capitalized 'Cookie' header when only Cookie is present", () => {
    const token = signer.sign({
      userId: "u-bob",
      isAdmin: false,
      expMs: clock.nowMs() + 60_000,
    });
    const cookie = buildSessionCookie(token);
    const req = {
      headers: { Cookie: cookie },
    } as unknown as HttpRequest;
    const r = requireAuth(req, deps);
    expect(r.ok).toBe(true);
  });

  it("returns 401 when record-style headers have neither cookie nor Cookie", () => {
    const req = {
      headers: { "content-type": "application/json" },
    } as unknown as HttpRequest;
    const r = requireAuth(req, deps);
    expect(r.ok).toBe(false);
  });
});
