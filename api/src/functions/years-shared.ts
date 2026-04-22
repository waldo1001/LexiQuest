import { PARTITIONS } from "../shared/table-partitions.js";
import type { TableStorage } from "../shared/table-storage.js";
import type { YearRow } from "../shared/seed.js";

export type { YearRow };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface YearCreateBody {
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export function validateYearCreate(
  body: unknown,
): { ok: true; value: YearCreateBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  if (typeof src.label !== "string" || src.label.trim().length === 0) {
    return { ok: false, error: "label is required" };
  }
  if (typeof src.start_date !== "string" || !DATE_RE.test(src.start_date)) {
    return { ok: false, error: "start_date must be YYYY-MM-DD" };
  }
  if (typeof src.end_date !== "string" || !DATE_RE.test(src.end_date)) {
    return { ok: false, error: "end_date must be YYYY-MM-DD" };
  }
  if (typeof src.is_current !== "boolean") {
    return { ok: false, error: "is_current must be boolean" };
  }
  return {
    ok: true,
    value: {
      label: src.label.trim(),
      start_date: src.start_date,
      end_date: src.end_date,
      is_current: src.is_current,
    },
  };
}

export interface YearPatchBody {
  label?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
}

export function validateYearPatch(
  body: unknown,
): { ok: true; patch: YearPatchBody } | { ok: false; error: string } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: YearPatchBody = {};
  if ("label" in src) {
    if (typeof src.label !== "string" || src.label.trim().length === 0) {
      return { ok: false, error: "label must be a non-empty string" };
    }
    patch.label = src.label.trim();
  }
  if ("start_date" in src) {
    if (typeof src.start_date !== "string" || !DATE_RE.test(src.start_date)) {
      return { ok: false, error: "start_date must be YYYY-MM-DD" };
    }
    patch.start_date = src.start_date;
  }
  if ("end_date" in src) {
    if (typeof src.end_date !== "string" || !DATE_RE.test(src.end_date)) {
      return { ok: false, error: "end_date must be YYYY-MM-DD" };
    }
    patch.end_date = src.end_date;
  }
  if ("is_current" in src) {
    if (typeof src.is_current !== "boolean") {
      return { ok: false, error: "is_current must be boolean" };
    }
    patch.is_current = src.is_current;
  }
  return { ok: true, patch };
}

export function yearProfile(row: YearRow): {
  id: string;
  label: string;
  is_current: boolean;
  start_date: string;
  end_date: string;
} {
  return {
    id: row.rowKey,
    label: row.label,
    is_current: row.is_current,
    start_date: row.start_date,
    end_date: row.end_date,
  };
}

/**
 * Clear `is_current` on every year row whose id is not `subjectId`.
 *
 * The caller is responsible for upserting the subject itself. This
 * helper only touches siblings, so a "no-op" call with an id that
 * doesn't exist in the partition is safe.
 */
export async function applyCurrentFlag(
  tables: TableStorage,
  subjectId: string,
): Promise<void> {
  const all = await tables.listByPartition<YearRow>("years", PARTITIONS.years);
  for (const y of all) {
    if (y.rowKey === subjectId) continue;
    if (y.is_current) {
      await tables.upsert<YearRow>("years", { ...y, is_current: false });
    }
  }
}
