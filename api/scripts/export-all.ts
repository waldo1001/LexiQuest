/* v8 ignore start */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TableClient } from "@azure/data-tables";
import {
  buildSnapshotPayload,
  KNOWN_TABLES,
  type KnownTable,
  type TableEntity,
} from "../src/shared/snapshot-payload.js";

function deriveSourceLabel(connectionString: string): string {
  if (/^UseDevelopmentStorage=true;?$/i.test(connectionString.trim())) {
    return "Azurite";
  }
  const m = connectionString.match(/(^|;)AccountName=([^;]+)/i);
  return m ? m[2] : "unknown";
}

async function listAllEntities(
  connectionString: string,
  table: KnownTable,
): Promise<TableEntity[]> {
  const client = TableClient.fromConnectionString(connectionString, table);
  const out: TableEntity[] = [];
  try {
    const iter = client.listEntities<Record<string, unknown>>();
    for await (const row of iter) {
      out.push(row as TableEntity);
    }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return [];
    throw err;
  }
  return out;
}

async function main(): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING_SOURCE;
  if (!connectionString || connectionString.length === 0) {
    console.error(
      "export-all: AZURE_STORAGE_CONNECTION_STRING_SOURCE not set",
    );
    process.exit(1);
  }

  if (!process.argv.includes("--yes")) {
    console.error(
      "export-all: refusing to proceed without --yes (this reads ALL " +
        "entities from every table; pass --yes to confirm)",
    );
    process.exit(1);
  }

  const source = deriveSourceLabel(connectionString);
  console.log(`export-all: READING FROM: ${source}`);

  const entities: Partial<Record<KnownTable, TableEntity[]>> = {};
  for (const table of KNOWN_TABLES) {
    const rows = await listAllEntities(connectionString, table);
    entities[table] = rows;
    console.log(`  ${table}: ${rows.length}`);
  }

  const nowIso = () => new Date().toISOString();
  const payload = buildSnapshotPayload({ source, nowIso, entities });

  const date = payload.exportedAt.slice(0, 10);
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..", "..");
  const outDir = resolve(repoRoot, "backups");
  const outPath = resolve(outDir, `lexiquest-${date}.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`export-all: wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error("export-all: failed —", (err as Error).message);
  process.exit(1);
});
/* v8 ignore stop */
