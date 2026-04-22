import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeYearsHandler, type YearsDeps } from "./years.js";
import type { YearRow } from "./years-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { FakeRandom } from "../../testing/fake-random.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

function makeReq(
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
      body === undefined ? Promise.reject(new Error("no body")) : body,
  } as unknown as HttpRequest;
}

const ctx = {} as InvocationContext;

function year(id: string, overrides: Partial<YearRow> = {}): YearRow {
  return {
    partitionKey: "years",
    rowKey: id,
    label: `label-${id}`,
    is_current: false,
    start_date: "2026-09-01",
    end_date: "2027-06-30",
    ...overrides,
  };
}

function makeDeps(uuids: readonly string[] = []): YearsDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
  random: FakeRandom;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  const random = new FakeRandom(uuids);
  return { tables, signer, clock, random };
}

describe("GET /api/years", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  function validCookie(userId = "u-admin", isAdmin = true): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  it("returns 401 without session cookie", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(null),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid cookie", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq("session=tampered"),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty array when no years exist", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie()),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual([]);
  });

  it("returns years sorted by start_date descending", async () => {
    await deps.tables.upsert<YearRow>(
      "years",
      year("y1", { label: "2024-2025", start_date: "2024-09-01" }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y2", { label: "2026-2027", start_date: "2026-09-01" }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y3", { label: "2025-2026", start_date: "2025-09-01" }),
    );

    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie("u-regular", false)),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Array<{ label: string }>;
    expect(body.map((y) => y.label)).toEqual([
      "2026-2027",
      "2025-2026",
      "2024-2025",
    ]);
  });
});

describe("POST /api/years", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps(["y-new-1"]);
  });

  function validCookie(userId = "u-admin", isAdmin = true): string {
    const token = deps.signer.sign({
      userId,
      isAdmin,
      expMs: deps.clock.nowMs() + 60_000,
    });
    return buildSessionCookie(token);
  }

  const validBody = () => ({
    label: "2027-2028",
    start_date: "2027-09-01",
    end_date: "2028-06-30",
    is_current: false,
  });

  it("returns 401 without session cookie", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(null, { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is non-admin", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie("u-regular", false), {
        method: "POST",
        body: validBody(),
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), start_date: "2027/09/01" },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing body", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie(), { method: "POST" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 201 with the created year profile and persists it", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie(), { method: "POST", body: validBody() }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe("y-new-1");
    expect(body.label).toBe("2027-2028");
    expect(body.is_current).toBe(false);

    const stored = await deps.tables.getById<YearRow>(
      "years",
      "years",
      "y-new-1",
    );
    expect(stored?.label).toBe("2027-2028");
    expect(stored?.start_date).toBe("2027-09-01");
    expect(stored?.end_date).toBe("2028-06-30");
  });

  it("with is_current=true unsets is_current on all existing years", async () => {
    await deps.tables.upsert<YearRow>(
      "years",
      year("y-old-1", { is_current: true }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y-old-2", { is_current: false }),
    );

    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie(), {
        method: "POST",
        body: { ...validBody(), is_current: true },
      }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(201);

    const all = await deps.tables.listByPartition<YearRow>("years", "years");
    const byId = Object.fromEntries(all.map((y) => [y.rowKey, y.is_current]));
    expect(byId).toEqual({
      "y-old-1": false,
      "y-old-2": false,
      "y-new-1": true,
    });
  });

  it("returns 405 for unsupported method PATCH", async () => {
    const res = (await makeYearsHandler(deps)(
      makeReq(validCookie(), { method: "PATCH" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });
});
