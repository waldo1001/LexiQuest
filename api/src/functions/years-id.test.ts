import { describe, it, expect, beforeEach } from "vitest";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { makeYearsIdHandler, type YearsIdDeps } from "./years-id.js";
import type { YearRow } from "./years-shared.js";
import { FakeTableStorage } from "../../testing/fake-table-storage.js";
import { FakeSessionSigner } from "../../testing/fake-session-signer.js";
import { FakeClock } from "../../testing/fake-clock.js";
import { buildSessionCookie } from "../shared/session-cookie.js";

function makeReq(
  cookie: string | null,
  params: Record<string, string> = {},
  opts: { method?: string; body?: unknown } = {},
): HttpRequest {
  const { method = "PUT", body } = opts;
  return {
    method,
    params,
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

function makeDeps(): YearsIdDeps & {
  tables: FakeTableStorage;
  signer: FakeSessionSigner;
  clock: FakeClock;
} {
  const tables = new FakeTableStorage();
  const clock = new FakeClock("2026-04-22T09:00:00.000Z");
  const signer = new FakeSessionSigner(clock);
  return { tables, signer, clock };
}

describe("PUT /api/years/:id", () => {
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
    const res = (await makeYearsIdHandler(deps)(
      makeReq(null, { id: "y1" }, { body: { label: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is non-admin", async () => {
    const res = (await makeYearsIdHandler(deps)(
      makeReq(
        validCookie("u-regular", false),
        { id: "y1" },
        { body: { label: "x" } },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body", async () => {
    await deps.tables.upsert<YearRow>("years", year("y1"));
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "y1" }, { body: { start_date: "bad" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 404 when year id unknown", async () => {
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "missing" }, { body: { label: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(404);
  });

  it("returns 400 when id path param is missing", async () => {
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), {}, { body: { label: "x" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });

  it("returns 200 with updated profile on happy path", async () => {
    await deps.tables.upsert<YearRow>("years", year("y1"));
    const res = (await makeYearsIdHandler(deps)(
      makeReq(
        validCookie(),
        { id: "y1" },
        { body: { label: "2028-2029", end_date: "2029-06-30" } },
      ),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, unknown>;
    expect(body.id).toBe("y1");
    expect(body.label).toBe("2028-2029");
    expect(body.end_date).toBe("2029-06-30");
    const stored = await deps.tables.getById<YearRow>("years", "years", "y1");
    expect(stored?.label).toBe("2028-2029");
  });

  it("with is_current=true unsets is_current on all siblings", async () => {
    await deps.tables.upsert<YearRow>(
      "years",
      year("y1", { is_current: true }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y2", { is_current: false }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y3", { is_current: false }),
    );
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "y3" }, { body: { is_current: true } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const all = await deps.tables.listByPartition<YearRow>("years", "years");
    const byId = Object.fromEntries(all.map((y) => [y.rowKey, y.is_current]));
    expect(byId).toEqual({ y1: false, y2: false, y3: true });
  });

  it("without is_current does not touch siblings", async () => {
    await deps.tables.upsert<YearRow>(
      "years",
      year("y1", { is_current: true }),
    );
    await deps.tables.upsert<YearRow>(
      "years",
      year("y2", { is_current: false }),
    );
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "y2" }, { body: { label: "renamed" } }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(200);
    const y1 = await deps.tables.getById<YearRow>("years", "years", "y1");
    expect(y1?.is_current).toBe(true);
  });

  it("returns 405 for unsupported method", async () => {
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "y1" }, { method: "DELETE" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(405);
  });

  it("returns 400 when body is missing", async () => {
    await deps.tables.upsert<YearRow>("years", year("y1"));
    const res = (await makeYearsIdHandler(deps)(
      makeReq(validCookie(), { id: "y1" }),
      ctx,
    )) as HttpResponseInit;
    expect(res.status).toBe(400);
  });
});
