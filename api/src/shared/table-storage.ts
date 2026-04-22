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
  getById<T extends Entity>(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<T | null>;
  listByPartition<T extends Entity>(
    table: TableName,
    partitionKey: string,
  ): Promise<T[]>;
  listByRowKeyRange<T extends Entity>(
    table: TableName,
    partitionKey: string,
    fromRowKey: string,
    toRowKey: string,
  ): Promise<T[]>;
  upsert<T extends Entity>(table: TableName, entity: T): Promise<void>;
  remove(
    table: TableName,
    partitionKey: string,
    rowKey: string,
  ): Promise<void>;
}

/**
 * JSON fields per table (Design.md §3.2). These are serialized to strings
 * when persisted to Azure Table Storage (which doesn't support nested
 * objects or arrays) and deserialized on read.
 */
export const JSON_FIELDS: Readonly<Record<TableName, readonly string[]>> = {
  users: ["settings"],
  years: [],
  courses: [],
  cards: ["distractors"],
  attempts: [],
  sessions: [],
};
