import { describe, it, expect, vi } from "vitest";
import {
  createCard,
  createCourse,
  createUser,
  createYear,
  deleteCard,
  deleteCourse,
  deleteUser,
  fetchCards,
  fetchCourses,
  fetchHelloMessage,
  fetchMe,
  fetchPublicUsers,
  fetchUsers,
  fetchYears,
  login,
  logout,
  patchMe,
  updateCard,
  updateCourse,
  updateUser,
  updateYear,
  importCards,
  batchCreateCards,
  bulkDeleteCards,
  enrichCards,
  reverseCards,
  fetchFamilyStats,
  fetchCompareStats,
  fetchUserStats,
  fetchCourseStats,
  fetchLeaderboard,
  fetchHeatmap,
  fetchUploadStats,
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

describe("fetchYears", () => {
  it("GETs /api/years with credentials and returns the list", async () => {
    const years = [{ id: "y1", label: "2026-2027", is_current: true }];
    const fakeFetch = vi.fn().mockResolvedValue(ok(years));
    expect(await fetchYears({ fetchFn: fakeFetch })).toEqual(years);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/years",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws on non-ok", async () => {
    await expect(
      fetchYears({ fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("createYear", () => {
  it("POSTs JSON and returns the created year", async () => {
    const body = {
      label: "2027-2028",
      start_date: "2027-09-01",
      end_date: "2028-06-30",
      is_current: false,
    };
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "y-new", ...body }),
    });
    const res = await createYear(body, { fetchFn: fakeFetch });
    expect(res.id).toBe("y-new");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/years",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(body),
      }),
    );
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      createYear({}, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
  });
});

describe("updateYear", () => {
  it("PUTs /api/years/:id and returns the updated year", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(ok({ id: "y1", is_current: true }));
    const res = await updateYear(
      "y1",
      { is_current: true },
      { fetchFn: fakeFetch },
    );
    expect(res.is_current).toBe(true);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/years/y1",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ is_current: true }),
      }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      updateYear("y1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateYear("y1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });
});

describe("fetchCourses", () => {
  it("without userId GETs /api/courses", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok([]));
    await fetchCourses(undefined, { fetchFn: fakeFetch });
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/courses",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("with userId appends ?userId=<id>", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok([]));
    await fetchCourses("u-bob", { fetchFn: fakeFetch });
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/courses?userId=u-bob",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws on non-ok", async () => {
    await expect(
      fetchCourses(undefined, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("createCourse", () => {
  it("POSTs JSON and returns the created course", async () => {
    const body = {
      name: "French",
      emoji: "🇫🇷",
      color: "#ff0000",
      language: "fr-FR",
      default_mode: "ask",
      year_id: "y1",
    };
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "c-new", ...body }),
    });
    const res = await createCourse(body, { fetchFn: fakeFetch });
    expect(res.id).toBe("c-new");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/courses",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(body),
      }),
    );
  });

  it("throws on non-ok", async () => {
    await expect(
      createCourse({}, { fetchFn: vi.fn().mockResolvedValue(fail(400)) }),
    ).rejects.toThrow(/400/);
  });
});

describe("updateCourse", () => {
  it("PUTs JSON to /api/courses/:id and returns the updated course", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok({ id: "c1", name: "Renamed" }));
    const res = await updateCourse(
      "c1",
      { name: "Renamed" },
      { fetchFn: fakeFetch },
    );
    expect(res.name).toBe("Renamed");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/courses/c1",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      updateCourse("c1", {}, {
        fetchFn: vi.fn().mockResolvedValue(fail(403)),
      }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateCourse("c1", {}, {
        fetchFn: vi.fn().mockResolvedValue(fail(404)),
      }),
    ).rejects.toThrow("not_found");
  });
});

describe("deleteCourse", () => {
  it("DELETEs /api/courses/:id and resolves on 204", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(
      deleteCourse("c1", { fetchFn: fakeFetch }),
    ).resolves.toBeUndefined();
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/courses/c1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      deleteCourse("c1", { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      deleteCourse("c1", { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });

  it("throws on other non-ok", async () => {
    await expect(
      deleteCourse("c1", { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("fetchCards", () => {
  it("GETs /api/cards?courseId=<id> and returns the list", async () => {
    const cards = [{ id: "card-1", question: "Q?", answer: "A" }];
    const fakeFetch = vi.fn().mockResolvedValue(ok(cards));
    const res = await fetchCards("c1", { fetchFn: fakeFetch });
    expect(res).toEqual(cards);
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/cards?courseId=c1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws on non-ok", async () => {
    await expect(
      fetchCards("c1", { fetchFn: vi.fn().mockResolvedValue(fail(401)) }),
    ).rejects.toThrow(/401/);
  });
});

describe("createCard", () => {
  it("POSTs JSON to /api/cards and returns the created card", async () => {
    const body = { course_id: "c1", question: "Q?", answer: "A" };
    const created = { id: "card-new", ...body };
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => created });
    const res = await createCard(body, { fetchFn: fakeFetch });
    expect(res.id).toBe("card-new");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/cards",
      expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
    );
  });

  it("throws on non-ok", async () => {
    await expect(
      createCard({}, { fetchFn: vi.fn().mockResolvedValue(fail(400)) }),
    ).rejects.toThrow(/400/);
  });
});

describe("updateCard", () => {
  it("PUTs JSON to /api/cards/:id?courseId= and returns updated card", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(ok({ id: "card-1", question: "Updated?" }));
    const res = await updateCard("card-1", "c1", { question: "Updated?" }, { fetchFn: fakeFetch });
    expect(res.question).toBe("Updated?");
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/cards/card-1?courseId=c1",
      expect.objectContaining({ method: "PUT", credentials: "include" }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      updateCard("card-1", "c1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      updateCard("card-1", "c1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });

  it("throws on other non-ok", async () => {
    await expect(
      updateCard("card-1", "c1", {}, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("bulkDeleteCards", () => {
  it("POSTs the uploadId selector and returns deleted count", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ deleted: 3 }));
    const result = await bulkDeleteCards(
      { courseId: "c1", uploadId: "upl-1" },
      { fetchFn },
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/cards/bulk-delete",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    const call = fetchFn.mock.calls[0][1];
    expect(JSON.parse(call.body)).toEqual({ courseId: "c1", uploadId: "upl-1" });
    expect(result).toEqual({ deleted: 3 });
  });

  it("POSTs the ids selector", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ deleted: 2 }));
    await bulkDeleteCards({ courseId: "c1", ids: ["a", "b"] }, { fetchFn });
    const call = fetchFn.mock.calls[0][1];
    expect(JSON.parse(call.body)).toEqual({ courseId: "c1", ids: ["a", "b"] });
  });

  it("POSTs the all selector", async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ deleted: 5 }));
    await bulkDeleteCards({ courseId: "c1", all: true }, { fetchFn });
    const call = fetchFn.mock.calls[0][1];
    expect(JSON.parse(call.body)).toEqual({ courseId: "c1", all: true });
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      bulkDeleteCards(
        { courseId: "c1", all: true },
        { fetchFn: vi.fn().mockResolvedValue(fail(403)) },
      ),
    ).rejects.toThrow("forbidden");
  });

  it("throws on other non-ok", async () => {
    await expect(
      bulkDeleteCards(
        { courseId: "c1", all: true },
        { fetchFn: vi.fn().mockResolvedValue(fail(500)) },
      ),
    ).rejects.toThrow(/500/);
  });
});

describe("deleteCard", () => {
  it("DELETEs /api/cards/:id?courseId= on success", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => {} });
    await deleteCard("card-1", "c1", { fetchFn: fakeFetch });
    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/cards/card-1?courseId=c1",
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("throws 'forbidden' on 403, 'not_found' on 404", async () => {
    await expect(
      deleteCard("card-1", "c1", { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
    await expect(
      deleteCard("card-1", "c1", { fetchFn: vi.fn().mockResolvedValue(fail(404)) }),
    ).rejects.toThrow("not_found");
  });

  it("throws on other non-ok", async () => {
    await expect(
      deleteCard("card-1", "c1", { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

import { startSession, postAttempts, closeSession } from "./api.js";

describe("startSession", () => {
  it("POSTs to /api/sessions and returns sessionId + cards", async () => {
    const data = { sessionId: "s1", cards: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await startSession({ courseId: "c1", mode: "self_grade" }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("sends gameType and cardLimit when provided", async () => {
    const data = { sessionId: "s1", cards: [], game_type: "boss_round", card_limit: 20 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    await startSession({ courseId: "c1", mode: "self_grade", gameType: "boss_round", cardLimit: 20 }, { fetchFn });
    const [, opts] = fetchFn.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.gameType).toBe("boss_round");
    expect(body.cardLimit).toBe(20);
  });

  it("omits gameType and cardLimit when not provided", async () => {
    const data = { sessionId: "s1", cards: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    await startSession({ courseId: "c1", mode: "self_grade" }, { fetchFn });
    const [, opts] = fetchFn.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.courseId).toBe("c1");
    expect(body.mode).toBe("self_grade");
    // gameType/cardLimit not in body since they weren't provided
  });

  it("throws on non-ok", async () => {
    await expect(
      startSession({ courseId: "c1", mode: "self_grade" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("postAttempts", () => {
  it("POSTs to /api/attempts and returns logged count", async () => {
    const data = { logged: 3 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await postAttempts({ sessionId: "s1", items: [] }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/attempts", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("throws on non-ok", async () => {
    await expect(
      postAttempts({ sessionId: "s1", items: [] }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("closeSession", () => {
  it("PUTs to /api/sessions/:id and returns the closed session", async () => {
    const data = { ended_at: "2026-04-22T10:05:00Z" };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await closeSession("sess-1", { cards_studied: 5, cards_correct: 3 }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/sessions/sess-1",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(result).toEqual(data);
  });

  it("throws on non-ok", async () => {
    await expect(
      closeSession("sess-1", { cards_studied: 0, cards_correct: 0 }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("importCards", () => {
  it("POSTs to /api/cards/import and returns candidates", async () => {
    const data = { candidates: [{ question: "Q", answer: "A", distractors: [] }] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await importCards({ courseId: "c1", imageBase64: "b64", mimeType: "image/jpeg" }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/cards/import", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      importCards({ courseId: "c1", imageBase64: "b64", mimeType: "image/jpeg" }, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
  });

  it("throws 'parse_error' on 422", async () => {
    await expect(
      importCards({ courseId: "c1", imageBase64: "b64", mimeType: "image/jpeg" }, { fetchFn: vi.fn().mockResolvedValue(fail(422)) }),
    ).rejects.toThrow("parse_error");
  });

  it("throws 'claude_error' on 502", async () => {
    await expect(
      importCards({ courseId: "c1", imageBase64: "b64", mimeType: "image/jpeg" }, { fetchFn: vi.fn().mockResolvedValue(fail(502)) }),
    ).rejects.toThrow("claude_error");
  });

  it("throws on generic non-ok", async () => {
    await expect(
      importCards({ courseId: "c1", imageBase64: "b64", mimeType: "image/jpeg" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("batchCreateCards", () => {
  it("POSTs to /api/cards/batch and returns created cards", async () => {
    const data = { cards: [{ id: "id-1", question: "Q", answer: "A" }] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await batchCreateCards({ courseId: "c1", cards: [{ question: "Q", answer: "A" }] }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/cards/batch", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      batchCreateCards({ courseId: "c1", cards: [] }, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
  });

  it("throws on non-ok", async () => {
    await expect(
      batchCreateCards({ courseId: "c1", cards: [] }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("enrichCards", () => {
  it("POSTs to /api/cards/enrich and returns enriched count", async () => {
    const data = { enriched: 3 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await enrichCards({ courseId: "c1" }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/cards/enrich", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      enrichCards({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
  });

  it("throws 'claude_error' on 502", async () => {
    await expect(
      enrichCards({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(502)) }),
    ).rejects.toThrow("claude_error");
  });

  it("throws on non-ok", async () => {
    await expect(
      enrichCards({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});

describe("fetchFamilyStats", () => {
  it("GETs /api/stats/family with range", async () => {
    const data = { users: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchFamilyStats({ range: "7d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/stats/family?range=7d", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchFamilyStats({}, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws on non-ok", async () => {
    await expect(fetchFamilyStats({}, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchCompareStats", () => {
  it("GETs /api/stats/compare with userIds, metric, range", async () => {
    const data = { series: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchCompareStats({ userIds: ["u1", "u2"], metric: "xp", range: "30d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining("/api/stats/compare"), expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchCompareStats({ userIds: [], metric: "xp" }, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws on non-ok", async () => {
    await expect(fetchCompareStats({ userIds: [], metric: "xp" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchUserStats", () => {
  it("GETs /api/stats/user/:userId", async () => {
    const data = { totalXp: 100 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchUserStats({ userId: "u1", range: "30d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/stats/user/u1?range=30d", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchUserStats({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws 'not_found' on 404", async () => {
    await expect(fetchUserStats({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(404)) })).rejects.toThrow("not_found");
  });
  it("throws on non-ok", async () => {
    await expect(fetchUserStats({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchCourseStats", () => {
  it("GETs /api/stats/course/:courseId", async () => {
    const data = { cardCount: 10 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchCourseStats({ courseId: "c1", range: "7d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/stats/course/c1?range=7d", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchCourseStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws 'not_found' on 404", async () => {
    await expect(fetchCourseStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(404)) })).rejects.toThrow("not_found");
  });
  it("throws on non-ok", async () => {
    await expect(fetchCourseStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchLeaderboard", () => {
  it("GETs /api/leaderboard with period", async () => {
    const data = { rankings: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchLeaderboard({ period: "7d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/leaderboard?period=7d", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchLeaderboard({}, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws on non-ok", async () => {
    await expect(fetchLeaderboard({}, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchHeatmap", () => {
  it("GETs /api/stats/heatmap/:userId with range", async () => {
    const data = { heatmap: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchHeatmap({ userId: "u1", range: "1y" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/stats/heatmap/u1?range=1y", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchHeatmap({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws 'not_found' on 404", async () => {
    await expect(fetchHeatmap({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(404)) })).rejects.toThrow("not_found");
  });
  it("throws on non-ok", async () => {
    await expect(fetchHeatmap({ userId: "u1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("fetchUploadStats", () => {
  it("GETs /api/stats/course/:courseId/uploads with range", async () => {
    const data = { uploads: [] };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    expect(await fetchUploadStats({ courseId: "c1", range: "7d" }, { fetchFn })).toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith("/api/stats/course/c1/uploads?range=7d", expect.anything());
  });
  it("throws 'unauthorized' on 401", async () => {
    await expect(fetchUploadStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(401)) })).rejects.toThrow("unauthorized");
  });
  it("throws 'not_found' on 404", async () => {
    await expect(fetchUploadStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(404)) })).rejects.toThrow("not_found");
  });
  it("throws on non-ok", async () => {
    await expect(fetchUploadStats({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) })).rejects.toThrow(/500/);
  });
});

describe("reverseCards", () => {
  it("POSTs to /api/cards/reverse and returns created/skipped", async () => {
    const data = { created: 5, skipped: 0 };
    const fetchFn = vi.fn().mockResolvedValue(ok(data));
    const result = await reverseCards({ courseId: "c1" }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/cards/reverse", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(data);
  });

  it("throws 'forbidden' on 403", async () => {
    await expect(
      reverseCards({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(403)) }),
    ).rejects.toThrow("forbidden");
  });

  it("throws on non-ok", async () => {
    await expect(
      reverseCards({ courseId: "c1" }, { fetchFn: vi.fn().mockResolvedValue(fail(500)) }),
    ).rejects.toThrow(/500/);
  });
});
