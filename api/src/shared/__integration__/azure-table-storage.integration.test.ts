/**
 * Runs the shared TableStorage contract against a real Azurite
 * instance. Set AZURITE_CONNECTION_STRING to enable; otherwise the
 * suite skips so CI without Azurite stays green.
 *
 * Boot Azurite locally:
 *   npx azurite-table --silent --location /tmp/azurite
 *
 * Default connection string:
 *   UseDevelopmentStorage=true
 */
import { describe, it } from "vitest";
import { AzureTableStorage } from "../azure-table-storage.js";
import { runTableStorageContract } from "../__contract__/table-storage.contract.js";
import type { TableName } from "../table-storage.js";

const connectionString = process.env.AZURITE_CONNECTION_STRING;

if (!connectionString) {
  describe.skip("AzureTableStorage contract (Azurite)", () => {
    it("skipped: AZURITE_CONNECTION_STRING not set", () => {});
  });
} else {
  const ALL_TABLES: TableName[] = [
    "users",
    "years",
    "courses",
    "cards",
    "attempts",
    "sessions",
  ];

  runTableStorageContract("AzureTableStorage (Azurite)", async () => {
    const store = new AzureTableStorage({ connectionString });
    // Drain any rows left by a previous run so each test starts from a
    // clean partition. (Safe: this runs only against Azurite.)
    for (const t of ALL_TABLES) {
      const rows = await store
        .listByPartition<{ partitionKey: string; rowKey: string }>(t, "users")
        .catch(() => []);
      for (const r of rows) {
        await store.remove(t, r.partitionKey, r.rowKey);
      }
      const userPartRows = await store
        .listByPartition<{ partitionKey: string; rowKey: string }>(t, "user-1")
        .catch(() => []);
      for (const r of userPartRows) {
        await store.remove(t, r.partitionKey, r.rowKey);
      }
    }
    return store;
  });
}
