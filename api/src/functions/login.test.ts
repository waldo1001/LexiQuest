import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeLoginHandler, type LoginDeps } from "./login.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakePasswordHasher } from "../../testing/fake-password-hasher.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeLogger } from "../../testing/fake-logger.js";
import { SESSION_COOKIE_NAME } from "../shared/session-cookie.js";
import type { UserRow } from "../shared/seed.js";

function req(body: unknown): HttpRequest {
  return {
    json: async () => body,
  } as unknown as HttpRequest;
}

function ctx(): InvocationContext {
  return {} as InvocationContext;
}

async function seedAlice(tables: FakeTableStorage, hasher: FakePasswordHasher) {
  const hash = await hasher.hash("alice-pw");
  const row: UserRow = {
    partitionKey: "users",
    rowKey: "u-alice",
    name: "Alice",
    password_hash: hash,
    is_admin: false,
    color: "#000",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 20 },
    created_at: "2026-04-22T00:00:00Z",
  };
  await tables.upsert<UserRow>("users", row);
  return row;
}

describe("POST /api/login", () => {
  let deps: LoginDeps;
  let tables: FakeTableStorage;
  let hasher: FakePasswordHasher;
  let logger: FakeLogger;

  beforeEach(() => {
    tables = new FakeTableStorage();
    hasher = new FakePasswordHasher();
    const clock = new FakeClock("2026-04-22T09:00:00Z");
    logger = new FakeLogger();
    deps = {
      tables,
      hasher,
      signer: new FakeSessionSigner(clock),
      clock,
      logger,
    };
  });

  it("returns 200 + user + Set-Cookie on valid creds", async () => {
    await seedAlice(tables, hasher);

    const response = (await makeLoginHandler(deps)(
      req({ userId: "u-alice", password: "alice-pw" }),
      ctx(),
    )) as HttpResponseInit;

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      id: "u-alice",
      name: "Alice",
      isAdmin: false,
      ui_language: "nl",
    });
    const cookie = (response.headers as Record<string, string>)["Set-Cookie"];
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("returns 401 on unknown user with a generic message", async () => {
    const response = (await makeLoginHandler(deps)(
      req({ userId: "u-nope", password: "anything" }),
      ctx(),
    )) as HttpResponseInit;
    expect(response.status).toBe(401);
    expect(response.jsonBody).toEqual({ error: "invalid credentials" });
  });

  it("returns 401 on wrong password with the same generic message", async () => {
    await seedAlice(tables, hasher);
    const response = (await makeLoginHandler(deps)(
      req({ userId: "u-alice", password: "wrong" }),
      ctx(),
    )) as HttpResponseInit;
    expect(response.status).toBe(401);
    expect(response.jsonBody).toEqual({ error: "invalid credentials" });
  });

  it("returns 400 on missing body fields", async () => {
    const h = makeLoginHandler(deps);
    expect(((await h(req({}), ctx())) as HttpResponseInit).status).toBe(400);
    expect(((await h(req({ userId: "x" }), ctx())) as HttpResponseInit).status).toBe(400);
    expect(((await h(req({ password: "x" }), ctx())) as HttpResponseInit).status).toBe(400);
    expect(
      ((await h(req(null), ctx())) as HttpResponseInit).status,
    ).toBe(400);
  });

  it("returns 400 when req.json() itself throws", async () => {
    const brokenReq = {
      json: async () => {
        throw new Error("bad body");
      },
    } as unknown as HttpRequest;
    const response = (await makeLoginHandler(deps)(
      brokenReq,
      ctx(),
    )) as HttpResponseInit;
    expect(response.status).toBe(400);
  });

  it("logs login_success with only userId; no password / hash keys", async () => {
    await seedAlice(tables, hasher);
    await makeLoginHandler(deps)(
      req({ userId: "u-alice", password: "alice-pw" }),
      ctx(),
    );
    const events = logger.records.map((r) => r.event);
    expect(events).toContain("login_success");
    for (const rec of logger.records) {
      const keys = Object.keys(rec.attrs ?? {});
      expect(keys).not.toContain("password");
      expect(keys).not.toContain("hash");
      expect(keys).not.toContain("password_hash");
    }
  });

  it("logs login_failed with userId + reason on bad password", async () => {
    await seedAlice(tables, hasher);
    await makeLoginHandler(deps)(
      req({ userId: "u-alice", password: "wrong" }),
      ctx(),
    );
    const fail = logger.records.find((r) => r.event === "login_failed");
    expect(fail).toBeDefined();
    expect(fail?.attrs?.reason).toBe("bad_password");
    expect(fail?.attrs?.userId).toBe("u-alice");
  });

  it("401 body does NOT leak the password_hash or plaintext", async () => {
    await seedAlice(tables, hasher);
    const response = (await makeLoginHandler(deps)(
      req({ userId: "u-alice", password: "wrong" }),
      ctx(),
    )) as HttpResponseInit;
    const serialized = JSON.stringify(response.jsonBody);
    expect(serialized).not.toContain("fake$");
    expect(serialized).not.toContain("alice-pw");
    expect(serialized).not.toContain("wrong");
  });
});
