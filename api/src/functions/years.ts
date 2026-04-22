import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { Random } from "../shared/random.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import {
  applyCurrentFlag,
  validateYearCreate,
  yearProfile,
  type YearRow,
} from "./years-shared.js";

export interface YearsDeps {
  tables: TableStorage;
  signer: SessionSigner;
  random: Random;
}

export function makeYearsHandler(deps: YearsDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "POST") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;

    if (method === "GET") {
      const rows = await deps.tables.listByPartition<YearRow>(
        "years",
        PARTITIONS.years,
      );
      const sorted = [...rows].sort((a, b) =>
        a.start_date > b.start_date ? -1 : a.start_date < b.start_date ? 1 : 0,
      );
      return { status: 200, jsonBody: sorted.map(yearProfile) };
    }

    if (!auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const body = await req.json().catch(() => null);
    const result = validateYearCreate(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { value } = result;

    const id = deps.random.uuid();
    const row: YearRow = {
      partitionKey: "years",
      rowKey: id,
      label: value.label,
      is_current: value.is_current,
      start_date: value.start_date,
      end_date: value.end_date,
    };
    await deps.tables.upsert<YearRow>("years", row);
    if (value.is_current) {
      await applyCurrentFlag(deps.tables, id);
    }

    return { status: 201, jsonBody: yearProfile(row) };
  };
}

/* v8 ignore start */
export function registerYears(deps: YearsDeps): void {
  app.http("years", {
    route: "years",
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: makeYearsHandler(deps),
  });
}
/* v8 ignore stop */
