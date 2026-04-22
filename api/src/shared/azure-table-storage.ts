/* v8 ignore start */
import { TableClient, odata } from "@azure/data-tables";
import type { Entity, TableName, TableStorage } from "./table-storage.js";
import {
  deserializeJsonFields,
  serializeJsonFields,
} from "./table-storage-json.js";

interface AzureTableStorageOptions {
  connectionString: string;
  /** Override for tests; defaults to @azure/data-tables TableClient. */
  clientFactory?: (connectionString: string, name: TableName) => TableClient;
}

/**
 * Real {@link TableStorage} backed by Azure Table Storage via
 * `@azure/data-tables`. Exercised by the Azurite contract runner
 * in Phase 2 Slice 5 — unit-coverage is opted out here via v8-ignore
 * because mocking the full `@azure/data-tables` surface provides
 * zero real signal over the contract tests themselves.
 */
export class AzureTableStorage implements TableStorage {
  private readonly clients: Map<TableName, TableClient> = new Map();
  private readonly createdTables: Set<TableName> = new Set();

  constructor(private readonly options: AzureTableStorageOptions) {}

  private client(table: TableName): TableClient {
    let c = this.clients.get(table);
    if (!c) {
      const factory =
        this.options.clientFactory ??
        ((cs, n) => TableClient.fromConnectionString(cs, n));
      c = factory(this.options.connectionString, table);
      this.clients.set(table, c);
    }
    return c;
  }

  private async ensureTable(table: TableName): Promise<void> {
    if (this.createdTables.has(table)) return;
    await this.client(table).createTable();
    this.createdTables.add(table);
  }

  async getById<T extends Entity>(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<T | null> {
    await this.ensureTable(table);
    try {
      const raw = await this.client(table).getEntity(partitionKey, rowKey);
      return deserializeJsonFields<T>(table, raw as Record<string, unknown>);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async listByPartition<T extends Entity>(
    table: TableName,
    partitionKey: string,
  ): Promise<T[]> {
    await this.ensureTable(table);
    const out: T[] = [];
    const iter = this.client(table).listEntities<Record<string, unknown>>({
      queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` },
    });
    for await (const row of iter) {
      out.push(deserializeJsonFields<T>(table, row));
    }
    return out;
  }

  async listByRowKeyRange<T extends Entity>(
    table: TableName,
    partitionKey: string,
    fromRowKey: string,
    toRowKey: string,
  ): Promise<T[]> {
    await this.ensureTable(table);
    const out: T[] = [];
    const iter = this.client(table).listEntities<Record<string, unknown>>({
      queryOptions: {
        filter: odata`PartitionKey eq ${partitionKey} and RowKey ge ${fromRowKey} and RowKey le ${toRowKey}`,
      },
    });
    for await (const row of iter) {
      out.push(deserializeJsonFields<T>(table, row));
    }
    out.sort((a, b) =>
      a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0,
    );
    return out;
  }

  async upsert<T extends Entity>(table: TableName, entity: T): Promise<void> {
    await this.ensureTable(table);
    const serialized = serializeJsonFields(table, entity);
    await this.client(table).upsertEntity(
      serialized as { partitionKey: string; rowKey: string },
      "Replace",
    );
  }

  async remove(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<void> {
    await this.ensureTable(table);
    try {
      await this.client(table).deleteEntity(partitionKey, rowKey);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return;
      throw err;
    }
  }
}
/* v8 ignore stop */
