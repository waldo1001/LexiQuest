import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeMeHandler, type MeDeps } from "./me.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

function req(
  cookie: string | null,
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "GET", body } = opts;
  return {
    method,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
    json: async () =>
      body === undefined
        ? Promise.reject(new Error("no body"))
        : body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function seedAlice(tables: FakeTableStorage) {
  const row: UserRow = {
    partitionKey: "users",
    rowKey: "u-alice",
    name: "Alice",
    password_hash: "fake$s0001$alice-pw",
    is_admin: true,
    color: "#abc",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "mcq", daily_goal: 15 },
    created_at: "2026-04-22T00:00:00Z",
  };
  tables.upsert<UserRow>("users", row);
  return row;
}

describe("GET /api/me", () => {
  let deps: MeDeps;
  let tables: FakeTableStorage;
  let signer: FakeSessionSigner;
  let clock: FakeClock;

  beforeEach(() => {
    tables = new FakeTableStorage();
    clock = new FakeClock("2026-04-22T09:00:00Z");
    signer = new FakeSessionSigner(clock);
    deps = { tables, signer };
  });

  it("returns the profile on valid cookie, without the password_hash", async () => {
    seedAlice(tables);
    const token = signer.sign({
      userId: "u-alice",
      isAdmin: true,
      expMs: clock.nowMs() + 60_000,
    });
    const res = (await makeMeHandler(deps)(
      req(buildSessionCookie(token)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe("u-alice");
    expect(body.name).toBe("Alice");
    expect(body.isAdmin).toBe(true);
    expect(body).not.toHaveProperty("password_hash");
    expect(JSON.stringify(body)).not.toContain("fake$");
  });

  it("returns 401 without cookie", async () => {
    const res = (await makeMeHandler(deps)(
      req(null),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 404 when the signed userId no longer exists", async () => {
    const token = signer.sign({
      userId: "u-ghost",
      isAdmin: false,
      expMs: clock.nowMs() + 60_000,
    });
    const res = (await makeMeHandler(deps)(
      req(buildSessionCookie(token)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/me", () => {
  let deps: MeDeps;
  let tables: FakeTableStorage;
  let signer: FakeSessionSigner;
  let clock: FakeClock;
  let validCookie: string;

  beforeEach(() => {
    tables = new FakeTableStorage();
    clock = new FakeClock("2026-04-22T09:00:00Z");
    signer = new FakeSessionSigner(clock);
    deps = { tables, signer };
    seedAlice(tables);
    const token = signer.sign({
      userId: "u-alice",
      isAdmin: true,
      expMs: clock.nowMs() + 60_000,
    });
    validCookie = buildSessionCookie(token);
  });

  it("returns 401 without a cookie", async () => {
    const res = (await makeMeHandler(deps)(
      req(null, { method: "PATCH", body: { ui_language: "en" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("updates ui_language and returns the new profile", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: { ui_language: "en" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).ui_language).toBe("en");
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.ui_language).toBe("en");
  });

  it("merges settings without clobbering omitted keys", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { daily_goal: 30 } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings).toEqual({
      auto_speak: true,
      preferred_mode: "mcq",
      daily_goal: 30,
    });
  });

  it("updates ui_language and settings in one call", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: {
          ui_language: "en",
          settings: { preferred_mode: "self_grade" },
        },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.ui_language).toBe("en");
    expect(stored?.settings.preferred_mode).toBe("self_grade");
    expect(stored?.settings.auto_speak).toBe(true);
  });

  it("rejects an invalid ui_language with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: { ui_language: "fr" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.ui_language).toBe("nl");
  });

  it("rejects an invalid settings value with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { daily_goal: "thirty" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("ignores body attempts to change userId / is_admin / name / password_hash", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: {
          userId: "u-other",
          is_admin: false,
          name: "Eve",
          password_hash: "tampered$hash",
          color: "#000000",
          avatar_emoji: "💀",
          created_at: "1999-01-01T00:00:00Z",
        },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.rowKey).toBe("u-alice");
    expect(stored?.is_admin).toBe(true);
    expect(stored?.name).toBe("Alice");
    expect(stored?.password_hash).toBe("fake$s0001$alice-pw");
    expect(stored?.color).toBe("#abc");
    expect(stored?.avatar_emoji).toBe("🦊");
    expect(stored?.created_at).toBe("2026-04-22T00:00:00Z");
  });

  it("GET still works after a PATCH (method dispatch)", async () => {
    await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: { ui_language: "en" } }),
      ctx,
    );
    const res = (await makeMeHandler(deps)(
      req(validCookie),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, unknown>).ui_language).toBe("en");
  });

  it("returns 404 when the signed userId no longer exists", async () => {
    const token = signer.sign({
      userId: "u-ghost",
      isAdmin: false,
      expMs: clock.nowMs() + 60_000,
    });
    const res = (await makeMeHandler(deps)(
      req(buildSessionCookie(token), {
        method: "PATCH",
        body: { ui_language: "en" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("accepts an empty body and returns the current profile", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: {} }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.ui_language).toBe("nl");
  });

  it("never returns password_hash in the response", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: { ui_language: "en" } }),
      ctx,
    )) as HttpResponseInit;
    const body = res.jsonBody as Record<string, unknown>;
    expect(body).not.toHaveProperty("password_hash");
    expect(JSON.stringify(body)).not.toContain("fake$");
  });

  it("rejects settings that is not an object (e.g. null) with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: { settings: null } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean auto_speak with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { auto_speak: "yes" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("accepts a boolean auto_speak", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { auto_speak: false } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.auto_speak).toBe(false);
  });

  it("rejects an invalid preferred_mode with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { preferred_mode: "flashcards" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("PATCH /me accepts valid theme and persists it", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { theme: "arcade" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.theme).toBe("arcade");
  });

  it("PATCH /me rejects invalid theme with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { theme: "neon-pony" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("PATCH /me accepts valid study_font_size and persists it", async () => {
    const resLarge = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: "large" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(resLarge.status).toBe(200);
    let stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.study_font_size).toBe("large");

    const resXLarge = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: "xlarge" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(resXLarge.status).toBe(200);
    stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.study_font_size).toBe("xlarge");

    const resNormal = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: "normal" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(resNormal.status).toBe(200);
    stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.study_font_size).toBe("normal");
  });

  it("PATCH /me rejects invalid study_font_size with 400", async () => {
    const resString = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: "huge" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(resString.status).toBe(400);

    const resNonString = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: 42 } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(resNonString.status).toBe(400);
  });

  it("PATCH /me preserves other settings when only study_font_size changes", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, {
        method: "PATCH",
        body: { settings: { study_font_size: "large" } },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const stored = await tables.getById<UserRow>("users", "users", "u-alice");
    expect(stored?.settings.auto_speak).toBe(true);
    expect(stored?.settings.preferred_mode).toBe("mcq");
    expect(stored?.settings.daily_goal).toBe(15);
    expect(stored?.settings.study_font_size).toBe("large");
  });

  it("rejects a non-object body with 400", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH", body: "not-an-object" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("treats a missing body as empty and returns 200 unchanged", async () => {
    // req.json() rejects — the handler should fall back to {} and
    // accept it as a no-op patch.
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
  });

  it("returns 405 for unsupported methods", async () => {
    const res = (await makeMeHandler(deps)(
      req(validCookie, { method: "POST", body: {} }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });
});
