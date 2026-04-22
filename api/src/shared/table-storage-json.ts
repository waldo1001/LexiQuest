import { JSON_FIELDS, type Entity, type TableName } from "./table-storage.js";

/**
 * Serialize the declared JSON fields on a table row to strings. Azure
 * Table Storage stores scalars only, so `distractors: string[]` and
 * `settings: object` are persisted as JSON-encoded strings.
 */
export function serializeJsonFields<T extends Entity>(
  table: TableName,
  entity: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(entity as Record<string, unknown>) };
  for (const field of JSON_FIELDS[table]) {
    const val = out[field];
    if (val !== undefined && typeof val !== "string") {
      out[field] = JSON.stringify(val);
    }
  }
  return out;
}

/**
 * Inverse of `serializeJsonFields`: parse declared JSON-field strings
 * back into JS values. Fields that are absent or already non-string
 * pass through untouched.
 */
export function deserializeJsonFields<T extends Entity>(
  table: TableName,
  raw: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...raw };
  for (const field of JSON_FIELDS[table]) {
    const val = out[field];
    if (typeof val === "string") {
      try {
        out[field] = JSON.parse(val);
      } catch {
        // Leave unparsed — caller will see the string and can decide.
      }
    }
  }
  return out as T;
}
