/* v8 ignore start */
import { AzureTableStorage } from "../src/shared/azure-table-storage.js";
import { BcryptPasswordHasher } from "../src/shared/bcrypt-password-hasher.js";
import { isAzuriteConnectionString } from "../src/shared/connection-string-guard.js";
import {
  MissingPasswordError,
  UserNotFoundError,
  BulkNoOpError,
  resetPassword,
  resetPasswordsBulk,
} from "../src/shared/reset-password.js";
import { SEED_USERS } from "../src/shared/seed.js";

interface CliFlags {
  name?: string;
  password?: string;
}

function parseArgv(argv: readonly string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--name") {
      flags.name = argv[i + 1];
      i += 1;
    } else if (arg === "--password") {
      flags.password = argv[i + 1];
      i += 1;
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString || connectionString.length === 0) {
    console.error("reset-password: AZURE_STORAGE_CONNECTION_STRING not set");
    process.exit(1);
  }

  if (!isAzuriteConnectionString(connectionString)) {
    console.error(
      "reset-password: refusing — AZURE_STORAGE_CONNECTION_STRING is not an " +
        "Azurite connection string. This script writes data and must NEVER " +
        "run against a real Azure Storage account.",
    );
    process.exit(1);
  }

  const tables = new AzureTableStorage({ connectionString });
  const hasher = new BcryptPasswordHasher();
  const flags = parseArgv(process.argv.slice(2));

  if (flags.name !== undefined && flags.name.length > 0) {
    const password = flags.password ?? process.env.RESET_PASSWORD;
    if (typeof password !== "string" || password.length === 0) {
      console.error(
        "reset-password: --password <value> or RESET_PASSWORD env var is required",
      );
      process.exit(1);
    }
    const result = await resetPassword({
      tables,
      hasher,
      name: flags.name,
      password,
    });
    console.log(JSON.stringify(result));
    return;
  }

  const envKeys: Record<string, string> = Object.fromEntries(
    SEED_USERS.map((u) => [u.name, `PASSWORD_${u.name.toUpperCase()}`]),
  );
  const results = await resetPasswordsBulk({
    tables,
    hasher,
    getPassword: (name) => {
      const key = envKeys[name];
      return key ? process.env[key] : undefined;
    },
  });
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err: unknown) => {
  if (err instanceof UserNotFoundError) {
    console.error("reset-password: user not found");
    process.exit(1);
  }
  if (err instanceof MissingPasswordError) {
    console.error("reset-password: password is required");
    process.exit(1);
  }
  if (err instanceof BulkNoOpError) {
    console.error(`reset-password: ${(err as Error).message}`);
    process.exit(1);
  }
  console.error("reset-password: failed —", (err as Error).message);
  process.exit(1);
});
/* v8 ignore stop */
