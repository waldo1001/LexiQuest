// Example: Fake TableStorage for LexiQuest tests.
// Copy into api/testing/fake-table-storage.ts at Phase 2.
//
// Contract: see ../../docs/tdd/testability-patterns.md §3.1.
// A shared assertion suite in api/shared/__contract__/tables.contract.test.ts
// is run against both this fake AND the real @azure/data-tables client
// (pointed at Azurite) to guarantee the fake does not drift.

export type TableName =
  | "users"
  | "years"
  | "courses"
  | "cards"
  | "attempts"
  | "sessions";

export interface Entity {
  partitionKey: string;
  rowKey: string;
}

export interface TableStorage {
  /** Returns the entity or null if not found. */
  getById<T extends Entity>(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<T | null>;
  /** Returns all entities with the given partition key, unsorted. */
  listByPartition<T extends Entity>(
    table: TableName,
    partitionKey: string,
  ): Promise<T[]>;
  /**
   * Returns entities whose rowKey falls in [fromRowKey, toRowKey], sorted
   * lexicographically by rowKey. Assumes rowKey is `{isoTimestamp}_{uuid}`
   * per the row-key format invariant.
   */
  listByRowKeyRange<T extends Entity>(
    table: TableName,
    partitionKey: string,
    fromRowKey: string,
    toRowKey: string,
  ): Promise<T[]>;
  /** Insert or replace. */
  upsert<T extends Entity>(table: TableName, entity: T): Promise<void>;
  /** Delete; no-op if not present. */
  remove(table: TableName, partitionKey: string, rowKey: string): Promise<void>;
}

export class FakeTableStorage implements TableStorage {
  // table → partitionKey → rowKey → entity
  private readonly store: Map<TableName, Map<string, Map<string, Entity>>> =
    new Map();

  async getById<T extends Entity>(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<T | null> {
    return (this.store.get(table)?.get(partitionKey)?.get(rowKey) as T) ?? null;
  }

  async listByPartition<T extends Entity>(
    table: TableName,
    partitionKey: string,
  ): Promise<T[]> {
    const partition = this.store.get(table)?.get(partitionKey);
    return partition ? (Array.from(partition.values()) as T[]) : [];
  }

  async listByRowKeyRange<T extends Entity>(
    table: TableName,
    partitionKey: string,
    fromRowKey: string,
    toRowKey: string,
  ): Promise<T[]> {
    const partition = this.store.get(table)?.get(partitionKey);
    if (!partition) return [];
    return Array.from(partition.entries())
      .filter(([rk]) => rk >= fromRowKey && rk <= toRowKey)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, entity]) => entity as T);
  }

  async upsert<T extends Entity>(table: TableName, entity: T): Promise<void> {
    if (!this.store.has(table)) this.store.set(table, new Map());
    const tbl = this.store.get(table)!;
    if (!tbl.has(entity.partitionKey)) tbl.set(entity.partitionKey, new Map());
    tbl.get(entity.partitionKey)!.set(entity.rowKey, entity);
  }

  async remove(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<void> {
    this.store.get(table)?.get(partitionKey)?.delete(rowKey);
  }

  // Test-only introspection. Not on the TableStorage interface because the
  // real client cannot do this cheaply.
  size(table: TableName, partitionKey?: string): number {
    if (partitionKey === undefined) {
      let total = 0;
      for (const p of this.store.get(table)?.values() ?? []) total += p.size;
      return total;
    }
    return this.store.get(table)?.get(partitionKey)?.size ?? 0;
  }
}
