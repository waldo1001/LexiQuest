/* v8 ignore start */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TableClient } from "@azure/data-tables";
import { isAzuriteConnectionString } from "../src/shared/connection-string-guard.js";
import {
  KNOWN_TABLES,
  type KnownTable,
  type TableEntity,
} from "../src/shared/snapshot-payload.js";

interface SnapshotFileShape {
  exportedAt?: string;
  source?: string;
  tables?: Partial<Record<KnownTable, TableEntity[]>>;
}

async function truncateTable(
  connectionString: string,
  table: KnownTable,
): Promise<void> {
  const client = TableClient.fromConnectionString(connectionString, table);
  try {
    await client.deleteTable();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
  // Azurite returns 409 (TableBeingDeleted) briefly after a deleteTable;
  // retry createTable a few times to absorb that.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await client.createTable();
      return;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 409 && attempt < 9) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      throw err;
    }
  }
}

async function loadEntities(
  connectionString: string,
  table: KnownTable,
  rows: TableEntity[],
): Promise<void> {
  const client = TableClient.fromConnectionString(connectionString, table);
  for (const row of rows) {
    const { etag: _etag, timestamp: _timestamp, ...persisted } = row as Record<
      string,
      unknown
    >;
    await client.upsertEntity(
      persisted as { partitionKey: string; rowKey: string },
      "Replace",
    );
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString || connectionString.length === 0) {
    console.error("import-local: AZURE_STORAGE_CONNECTION_STRING not set");
    process.exit(1);
  }

  if (!isAzuriteConnectionString(connectionString)) {
    console.error(
      "import-local: refusing — AZURE_STORAGE_CONNECTION_STRING is not an " +
        "Azurite connection string. This script writes data and must NEVER " +
        "run against a real Azure Storage account.",
    );
    process.exit(1);
  }

  const backupArg = process.argv[2];
  if (!backupArg) {
    console.error("import-local: usage — npm run import-local -- <backup.json>");
    process.exit(1);
  }
  const backupPath = resolve(process.cwd(), backupArg);

  const raw = await readFile(backupPath, "utf8");
  const parsed = JSON.parse(raw) as SnapshotFileShape;
  if (!parsed || typeof parsed !== "object" || !parsed.tables) {
    console.error(
      `import-local: ${backupPath} is not a valid snapshot (missing 'tables')`,
    );
    process.exit(1);
  }

  console.log("import-local: WRITING TO: Azurite (local)");
  console.log(`import-local: source=${parsed.source ?? "?"} exportedAt=${parsed.exportedAt ?? "?"}`);

  for (const table of KNOWN_TABLES) {
    const rows = parsed.tables[table] ?? [];
    await truncateTable(connectionString, table);
    await loadEntities(connectionString, table, rows);
    console.log(`  ${table}: ${rows.length}`);
  }

  console.log("import-local: done");
}

main().catch((err: unknown) => {
  console.error("import-local: failed —", (err as Error).message);
  process.exit(1);
});
/* v8 ignore stop */
