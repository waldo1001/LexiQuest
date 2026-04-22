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

function req(cookie: string | null): HttpRequest {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "cookie" ? cookie : null;
      },
    },
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
