/* v8 ignore start */
import { AzureTableStorage } from "../src/shared/azure-table-storage.js";
import { BcryptPasswordHasher } from "../src/shared/bcrypt-password-hasher.js";
import { SystemClock } from "../src/shared/clock.js";
import { SystemRandom } from "../src/shared/random.js";
import { seed, SEED_USERS } from "../src/shared/seed.js";

const ENV_KEYS: Record<string, string> = Object.fromEntries(
  SEED_USERS.map((u) => [u.name, `PASSWORD_${u.name.toUpperCase()}`]),
);

async function main(): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString || connectionString.length === 0) {
    console.error("seed: AZURE_STORAGE_CONNECTION_STRING not set");
    process.exit(1);
  }

  const result = await seed({
    tables: new AzureTableStorage({ connectionString }),
    hasher: new BcryptPasswordHasher(),
    clock: new SystemClock(),
    random: new SystemRandom(),
    getPassword: (name) => {
      const key = ENV_KEYS[name];
      return key ? process.env[key] : undefined;
    },
  });

  const summary = {
    users: result.users.map((u) => ({
      id: u.id,
      name: u.name,
      created: u.created,
    })),
    year: result.year,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err: unknown) => {
  console.error("seed: failed —", (err as Error).message);
  process.exit(1);
});
/* v8 ignore stop */
