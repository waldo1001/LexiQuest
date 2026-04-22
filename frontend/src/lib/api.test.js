import { describe, it, expect, vi } from "vitest";
import {
  fetchHelloMessage,
  fetchMe,
  fetchPublicUsers,
  login,
  logout,
} from "./api.js";

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}
function fail(status, body = {}) {
  return { ok: false, status, json: async () => body };
}

describe("fetchHelloMessage", () => {
  it("returns the msg string on a 200 JSON response", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok({ msg: "Hello from LexiQuest" }));
    expect(await fetchHelloMessage({ fetchFn: fakeFetch })).toBe(
      "Hello from LexiQuest",
    );
    expect(fakeFetch).toHaveBeenCalledWith("/api/hello");
  });

  it("throws when the response status is not ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(fetchHelloMessage({ fetchFn: fakeFetch })).rejects.toThrow();
  });
});

describe("fetchPublicUsers", () => {
  it("returns the parsed JSON array", async () => {
    const users = [
      { id: "u1", name: "Alice", avatar_emoji: "🦊", color: "#000" },
    ];
    const fakeFetch = vi.fn().mockResolvedValue(ok(users));
    expect(await fetchPublicUsers({ fetchFn: fakeFetch })).toEqual(users);
    expect(fakeFetch).toHaveBeenCalledWith("/api/users/public");
  });

  it("throws on non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(fetchPublicUsers({ fetchFn: fakeFetch })).rejects.toThrow();
  });
});

describe("login", () => {
  it("POSTs the creds as JSON and returns the user shape", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      ok({ id: "u1", name: "Alice", isAdmin: false, ui_language: "nl" }),
    );
    const res = await login(
      { userId: "u1", password: "pw" },
      { fetchFn: fakeFetch },
    );
    expect(res.name).toBe("Alice");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: "u1", password: "pw" }),
      }),
    );
  });

  it("throws 'invalid credentials' on 401", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(401));
    await expect(
      login({ userId: "u1", password: "x" }, { fetchFn: fakeFetch }),
    ).rejects.toThrow("invalid credentials");
  });

  it("throws a generic error on other non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(
      login({ userId: "u1", password: "x" }, { fetchFn: fakeFetch }),
    ).rejects.toThrow(/500/);
  });
});

describe("fetchMe", () => {
  it("returns the parsed JSON on 200", async () => {
    const me = { id: "u1", name: "Alice" };
    const fakeFetch = vi.fn().mockResolvedValue(ok(me));
    expect(await fetchMe({ fetchFn: fakeFetch })).toEqual(me);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws 'unauthorized' on 401", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(401));
    await expect(fetchMe({ fetchFn: fakeFetch })).rejects.toThrow(
      "unauthorized",
    );
  });

  it("throws a generic error on other non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(fetchMe({ fetchFn: fakeFetch })).rejects.toThrow(/500/);
  });
});

describe("logout", () => {
  it("POSTs /api/logout and resolves void", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await logout({ fetchFn: fakeFetch });
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
