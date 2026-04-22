import {
  app,
  type HttpHandler,
  type HttpRequest,
  type HttpResponseInit,
} from "@azure/functions";
import { requireAuth } from "../shared/auth.js";
import type { SessionSigner } from "../shared/session-signer.js";
import type { TableStorage } from "../shared/table-storage.js";
import { PARTITIONS } from "../shared/table-partitions.js";
import {
  applyCurrentFlag,
  validateYearPatch,
  yearProfile,
  type YearRow,
} from "./years-shared.js";

export interface YearsIdDeps {
  tables: TableStorage;
  signer: SessionSigner;
}

export function makeYearsIdHandler(deps: YearsIdDeps): HttpHandler {
  return async (req: HttpRequest): Promise<HttpResponseInit> => {
    const method = (req.method ?? "PUT").toUpperCase();
    if (method !== "PUT") {
      return { status: 405, jsonBody: { error: "method not allowed" } };
    }

    const auth = requireAuth(req, deps);
    if (!auth.ok) return auth.response;
    if (!auth.auth.isAdmin) {
      return { status: 403, jsonBody: { error: "forbidden" } };
    }

    const id = getIdParam(req);
    if (!id) {
      return { status: 400, jsonBody: { error: "missing id path param" } };
    }

    const body = await req.json().catch(() => null);
    if (body === null) {
      return { status: 400, jsonBody: { error: "body must be an object" } };
    }
    const result = validateYearPatch(body);
    if (!result.ok) {
      return { status: 400, jsonBody: { error: result.error } };
    }
    const { patch } = result;

    const existing = await deps.tables.getById<YearRow>(
      "years",
      PARTITIONS.years,
      id,
    );
    if (!existing) {
      return { status: 404, jsonBody: { error: "year not found" } };
    }

    const merged: YearRow = {
      ...existing,
      label: patch.label ?? existing.label,
      start_date: patch.start_date ?? existing.start_date,
      end_date: patch.end_date ?? existing.end_date,
      is_current:
        patch.is_current === undefined ? existing.is_current : patch.is_current,
    };
    await deps.tables.upsert<YearRow>("years", merged);
    if (patch.is_current === true) {
      await applyCurrentFlag(deps.tables, id);
    }

    return { status: 200, jsonBody: yearProfile(merged) };
  };
}

function getIdParam(req: HttpRequest): string | null {
  const params = (req as unknown as { params?: Record<string, string> }).params;
  const id = params?.id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

/* v8 ignore start */
export function registerYearsId(deps: YearsIdDeps): void {
  app.http("years-id", {
    route: "years/{id}",
    methods: ["PUT"],
    authLevel: "anonymous",
    handler: makeYearsIdHandler(deps),
  });
}
/* v8 ignore stop */
