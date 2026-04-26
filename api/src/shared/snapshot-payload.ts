import {
  PARTITIONS,
  USER_OWNED_PARTITION,
} from "./table-partitions.js";

/**
 * The six tables that compose a full LexiQuest snapshot.
 *
 * Derived from the partition maps so a future schema addition surfaces
 * here without a separate code change — see `KNOWN_TABLES` test that
 * pins this equivalence.
 */
export const KNOWN_TABLES = [
  ...Object.keys(PARTITIONS),
  ...Object.keys(USER_OWNED_PARTITION),
] as const;

export type KnownTable = (typeof KNOWN_TABLES)[number];

export type TableEntity = Record<string, unknown>;

export interface SnapshotPayload {
  exportedAt: string;
  source: string;
  tables: Record<KnownTable, TableEntity[]>;
}

export interface BuildSnapshotPayloadInput {
  source: string;
  nowIso: () => string;
  entities: Partial<Record<KnownTable, TableEntity[]>>;
}

export function buildSnapshotPayload(
  input: BuildSnapshotPayloadInput,
): SnapshotPayload {
  const tables = {} as Record<KnownTable, TableEntity[]>;
  for (const t of KNOWN_TABLES) {
    tables[t] = input.entities[t] ?? [];
  }
  return {
    exportedAt: input.nowIso(),
    source: input.source,
    tables,
  };
}
