import { describe, it, expect, vi } from "vitest";
import {
  createUser,
  deleteUser,
  fetchHelloMessage,
  fetchMe,
  fetchPublicUsers,
  fetchUsers,
  login,
  logout,
  patchMe,
  updateUser,
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

describe("patchMe", () => {
  it("PATCHes /api/me with JSON body and credentials, returns the parsed profile", async () => {
    const updated = { id: "u1", name: "Alice", ui_language: "en" };
    const fakeFetch = vi.fn().mockResolvedValue(ok(updated));
    const res = await patchMe(
      { ui_language: "en" },
      { fetchFn: fakeFetch },
    );
    expect(res).toEqual(updated);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ui_language: "en" }),
      }),
    );
  });

  it("throws 'unauthorized' on 401", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(401));
    await expect(
      patchMe({ ui_language: "en" }, { fetchFn: fakeFetch }),
    ).rejects.toThrow("unauthorized");
  });

  it("throws a generic error on 400", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(400));
    await expect(
      patchMe({ ui_language: "fr" }, { fetchFn: fakeFetch }),
    ).rejects.toThrow(/400/);
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

describe("fetchUsers", () => {
  it("GETs /api/users with credentials and returns the array", async () => {
    const users = [{ id: "u1", name: "Alice" }];
    const fakeFetch = vi.fn().mockResolvedValue(ok(users));
    expect(await fetchUsers({ fetchFn: fakeFetch })).toEqual(users);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws 'unauthorized' on 401", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(401));
    await expect(fetchUsers({ fetchFn: fakeFetch })).rejects.toThrow(
      "unauthorized",
    );
  });

  it("throws a generic error on other non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(fetchUsers({ fetchFn: fakeFetch })).rejects.toThrow(/500/);
  });
});

describe("createUser", () => {
  it("POSTs JSON and returns the created profile", async () => {
    const profile = { id: "u1", name: "Zoe" };
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => profile,
    });
    const res = await createUser(
      { name: "Zoe", password: "pw" },
      { fetchFn: fakeFetch },
    );
    expect(res).toEqual(profile);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: "Zoe", password: "pw" }),
      }),
    );
  });

  it("throws 'forbidden' on 403", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(403));
    await expect(createUser({}, { fetchFn: fakeFetch })).rejects.toThrow(
      "forbidden",
    );
  });

  it("throws 'duplicate' on 409", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(409));
    await expect(createUser({}, { fetchFn: fakeFetch })).rejects.toThrow(
      "duplicate",
    );
  });

  it("throws a generic error on other non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(400));
    await expect(createUser({}, { fetchFn: fakeFetch })).rejects.toThrow(
      /400/,
    );
  });
});

describe("updateUser", () => {
  it("PUTs JSON to /api/users/:id and returns the updated profile", async () => {
    const profile = { id: "u1", name: "Renamed" };
    const fakeFetch = vi.fn().mockResolvedValue(ok(profile));
    const res = await updateUser(
      "u1",
      { name: "Renamed" },
      { fetchFn: fakeFetch },
    );
    expect(res).toEqual(profile);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/users/u1",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
  });

  it("encodes path-unsafe characters in id", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok({}));
    await updateUser("u/1", {}, { fetchFn: fakeFetch });
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/users/u%2F1",
      expect.any(Object),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      updateUser("u1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateUser("u1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });

  it("throws a generic error on 400", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(400));
    await expect(
      updateUser("u1", {}, { fetchFn: fakeFetch }),
    ).rejects.toThrow(/400/);
  });
});

describe("deleteUser", () => {
  it("DELETEs /api/users/:id and resolves void on 204", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(
      deleteUser("u1", { fetchFn: fakeFetch }),
    ).resolves.toBeUndefined();
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/users/u1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      deleteUser("u1", { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      deleteUser("u1", { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });

  it("throws a generic error on other non-ok", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(fail(500));
    await expect(
      deleteUser("u1", { fetchFn: fakeFetch }),
    ).rejects.toThrow(/500/);
  });
});
