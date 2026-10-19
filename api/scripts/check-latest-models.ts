/* v8 ignore start -- @preserve */
/**
 * Model watch (spec #7): is a newer Claude Sonnet or Haiku available than the
 * pins in src/shared/claude.ts? Prints a JSON report (see buildReport); the
 * weekly workflow .github/workflows/model-watch.yml turns a stale report into
 * an issue. The logic lives in src/shared/model-catalog.ts.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/check-latest-models.ts
 *
 * Exit 0 when the check ran (stale or not); 2 when the key is missing or the
 * Models API call fails. The key is never printed.
 */
import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL, SONNET_MODEL } from "../src/shared/claude.js";
import { buildReport, type ListedModel } from "../src/shared/model-catalog.js";

async function main(): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("check-latest-models: ANTHROPIC_API_KEY is not set");
    return 2;
  }

  const client = new Anthropic({ apiKey });
  const models: ListedModel[] = [];
  try {
    for await (const m of client.models.list({ limit: 100 })) {
      models.push({ id: m.id, created_at: m.created_at });
    }
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    const suffix = typeof status === "number" ? ` (HTTP ${status})` : "";
    console.error(`check-latest-models: the Models API call failed${suffix}`);
    return 2;
  }

  const report = buildReport({ sonnet: SONNET_MODEL, haiku: HAIKU_MODEL }, models);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

void main().then((code) => process.exit(code));
/* v8 ignore stop -- @preserve */
