import type {
  Entity,
  TableName,
  TableStorage,
} from "../src/shared/table-storage.js";

export class FakeTableStorage implements TableStorage {
  private readonly store: Map<TableName, Map<string, Map<string, Entity>>> =
    new Map();

  async getById<T extends Entity>(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<T | null> {
    return (
      (this.store.get(table)?.get(partitionKey)?.get(rowKey) as T) ?? null
    );
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
    let tbl = this.store.get(table);
    if (!tbl) {
      tbl = new Map();
      this.store.set(table, tbl);
    }
    let partition = tbl.get(entity.partitionKey);
    if (!partition) {
      partition = new Map();
      tbl.set(entity.partitionKey, partition);
    }
    partition.set(entity.rowKey, entity);
  }

  async remove(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<void> {
    this.store.get(table)?.get(partitionKey)?.delete(rowKey);
  }

  size(table: TableName, partitionKey?: string): number {
    if (partitionKey === undefined) {
      let total = 0;
      for (const p of this.store.get(table)?.values() ?? []) total += p.size;
      return total;
    }
    return this.store.get(table)?.get(partitionKey)?.size ?? 0;
  }
}
