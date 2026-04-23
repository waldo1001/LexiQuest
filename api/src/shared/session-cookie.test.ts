import { describe, it, expect } from "vitest";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./session-cookie.js";

describe("buildSessionCookie", () => {
  it("emits HttpOnly + Secure + SameSite=Lax + Path=/ + 30-day Max-Age when secure=true", () => {
    const cookie = buildSessionCookie("abc.def", true);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=abc.def`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("omits Secure when secure=false", () => {
    const cookie = buildSessionCookie("abc.def", false);
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });
});

describe("buildClearedSessionCookie", () => {
  it("clears the cookie with Max-Age=0 and emits Secure when secure=true", () => {
    const cleared = buildClearedSessionCookie(true);
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("Secure");
  });

  it("omits Secure when secure=false", () => {
    const cleared = buildClearedSessionCookie(false);
    expect(cleared).not.toContain("Secure");
    expect(cleared).toContain("Max-Age=0");
  });
});

describe("readSessionCookie", () => {
  it("extracts the session cookie value", () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=abc.def`)).toBe("abc.def");
  });

  it("ignores other cookies in the header", () => {
    expect(
      readSessionCookie(
        `other=foo; ${SESSION_COOKIE_NAME}=the-token; another=bar`,
      ),
    ).toBe("the-token");
  });

  it("returns null when cookie is absent", () => {
    expect(readSessionCookie("other=foo")).toBeNull();
  });

  it("returns null on empty / null header", () => {
    expect(readSessionCookie(null)).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie("")).toBeNull();
  });

  it("returns null when cookie value is empty", () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=`)).toBeNull();
  });
});
