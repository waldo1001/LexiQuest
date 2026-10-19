---
issue: 7
status: implemented
---

# Card import always runs on the newest Claude Sonnet and Haiku

Status: implemented, 2026-10-19 (section 12 records what was built and where it differs). Owner: waldo.
Scope: the model pins and the four Claude calls in `api/src/shared/claude.ts`, the Claude error
mapping in `api/src/functions/cards-import.ts`, a new pure module `api/src/shared/model-catalog.ts`,
a new CLI `api/scripts/check-latest-models.ts`, a new workflow `.github/workflows/model-watch.yml`,
and the AI lines of `Design.md`. Every claim below was verified against the tree at `a2feb02` on
2026-10-19. Model facts (IDs, prices, breaking changes) come from Anthropic's model catalog and
migration guide as bundled with Claude Code's `claude-api` skill (cached 2026-10-06) and from the
installed SDK. Not in scope: switching models automatically at runtime (rejected, §3 D-1), Opus or
Fable for extraction, prompt rewrites beyond what the 5.5 models need, an automated
extraction-quality eval (§8), an SDK upgrade (`@anthropic-ai/sdk` 0.135.0 already has everything).

## 1. Goal

Card extraction runs on models one and two releases behind, and nothing notices when a newer one
ships.

- `api/src/shared/claude.ts:65` pins `SONNET_MODEL = "claude-sonnet-4-6"` (photos, PowerPoint
  slides, the language check, distractors); `:72` pins `HAIKU_MODEL = "claude-haiku-4-5-20251001"`
  (PDF page batches, chosen to stay under the Azure SWA 45 s per-request cap — `claude.ts:66-71`).
  The router is `api/src/functions/cards-import.ts:230` (`isPdf ? HAIKU_MODEL : SONNET_MODEL`).
- The current models are **`claude-sonnet-5-5`** (Sonnet 4.6 → 5 → 5.5) and **`claude-haiku-5-5`**.
  Both are in the installed SDK's `Model` union
  (`api/node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`, SDK 0.135.0).
- They are cheaper per token: Sonnet $3 / $15 → $2 / $10 per MTok input / output; Haiku $1 / $5 →
  $0.10 / $0.50 (prompts up to 100K tokens; $0.50 / $2.50 above). Both use a newer tokenizer that
  counts the same text as about 30% more tokens.
- **There is no floating "latest" alias.** IDs are per release (`claude-haiku-5-5` is "a fixed ID
  with no separate alias"), so "always the newest" needs a mechanism. Today the pin was set once
  (`docs/changelog.md:167`, Phase 12) and Haiku added later (`docs/changelog.md:43`); `Design.md:964`
  even says "or latest stable model name at time of implementation".
- **A bare ID swap would break this wrapper.** The four calls (`claude.ts:243`, `:262`, `:292`,
  `:315`) send only `model`, `max_tokens` (4096, 4096, 4096, 1024) and `messages`. On both 5.5
  models, omitting `thinking` runs adaptive thinking (Sonnet 5.5 default effort `high`, Haiku 5.5
  `medium`), and thinking counts toward `max_tokens` — a JSON reply can stop with
  `stop_reason: "max_tokens"`. Refusals (`stop_reason: "refusal"`) are new for these routes. Today
  both end as an empty or cut-off text → `ClaudeJsonParseError` → 422 (`cards-import.ts:256`) →
  "Claude could not read the file" (`frontend/src/lib/api.js:539`, `PhotoImport.jsx:303`,
  `import.error.parse`), with nothing logged that says why.
- Baseline: 986 api tests (1 skipped) and 659 frontend tests green — `npm run test:api` /
  `npm run test:frontend` at `cdd6a03` on 2026-10-19; `git diff --stat cdd6a03..a2feb02 -- api/src
  frontend/src api/testing` is empty, so the counts hold at `a2feb02`.

After this change:

- Photos, slides, the language check and distractors run on `claude-sonnet-5-5`; PDF batches on
  `claude-haiku-5-5`.
- Every call sets its effort explicitly and leaves room for thinking; a refusal or a cut-off reply
  is a typed, logged error instead of a mystery parse failure.
- Every Monday a GitHub Action asks the Models API for the newest Sonnet and Haiku; when either is
  newer than the pin, it opens (or comments on) one issue naming it. The switch itself stays a
  small, reviewed, tested change — a spec the League can build.

## 2. Behaviour after

- **Family-visible: nothing intended.** Same screens, same Import Review, same messages. Imports
  should cost less; a learner may see slightly different (ideally better) card candidates.
- **Errors keep today's wording.** A refusal or a cut-off reply returns 422, which the frontend
  already shows as `import.error.parse` (NL and EN unchanged). No new i18n keys.
- **Developer-visible:** two new log events, `cards_import_claude_refused` and
  `cards_import_claude_truncated` (§4); and, when a newer model ships, an issue titled
  "Newer Claude model available" (no labels).

## 3. Decisions

- **D-1 Pin the newest IDs and alert on drift; do not switch at runtime.** The SDK can list models
  (`client.models.list()`, with `created_at`), so a cold-start resolver is possible — rejected
  because each generation has shipped changes this wrapper hits (on 5.5: thinking on by default
  eating `max_tokens`; Sonnet 5.5 rejects `thinking: {type: "disabled"}` that Sonnet 5 accepted;
  refusals new), because latency shifts would silently threaten the 45 s cap measured for Haiku 4.5
  batches (6.4–12.2 s, `docs/changelog.md:43`), and because the switch would happen with no test
  run, no deploy and no commit to revert; it would also add a Models API call to every cold start.
  Rejected too: a one-time bump with no alert (does not satisfy "always"). Owner can flip: §9 Q1.
- **D-2 Exact IDs, no date suffix:** `claude-sonnet-5-5`, `claude-haiku-5-5`. (Haiku 4.5 was pinned
  by its dated full ID; the 5.5 IDs have no dated variant.)
- **D-3 Keep the split.** Sonnet for images, slides, the language check and distractors; Haiku for
  PDF batches (45 s cap, `claude.ts:66-71`). Rejected: Haiku everywhere — about ten times cheaper,
  but photo extraction quality is the product; revisit with an eval (§8).
- **D-4 Effort `low`, adaptive thinking, on all four calls,** set explicitly as
  `output_config: { effort: "low" }` (typed in SDK 0.135, `messages.d.ts:3591`). It is the
  migration guide's starting point for extraction and classification on both models; at `low` the
  model skips thinking on most simple requests. No `thinking` field is sent. Rejected as the
  default: thinking off (Sonnet `between_tools`, Haiku `disabled`) — kept as the fallback if the
  latency probe fails (§9 R1).
- **D-5 `max_tokens` 4096 → 16000** for the three extraction calls and **1024 → 4000** for
  distractors: thinking counts toward the cap and the new tokenizers count ~30% more tokens. 16000
  is the guide's non-streaming default; replies are small, so calls stay non-streaming.
- **D-6 Read `stop_reason` before the text.** `"refusal"` → `ClaudeRefusalError(category)` with
  `stop_details.category`; `"max_tokens"` → `ClaudeTruncatedError`. Content is still read by block
  `type` (`claude.ts:254` does this already; a 5.5 reply can start with a `thinking` block). The
  logic moves into pure helpers outside the `v8 ignore` block so it is unit-tested.
- **D-7 Server-side fallback on the Sonnet calls:** `fallbacks: "default"` with the
  `server-side-fallback-2026-07-01` beta, through `client.beta.messages.create` (typed,
  `beta/messages/messages.d.ts:6980`). It is the recommended default for Sonnet 5.5 code on the
  Claude API: a `cyber` or `frontier_llm` decline is retried on Claude Sonnet 5 inside the same call.
  **Not on Haiku** — Claude Haiku 5.5 has no server-side fallback. Strike if unwanted: §9 Q3.
- **D-8 Drift alert = pure logic + thin CLI + weekly workflow.** `model-catalog.ts` (pure, Tier A)
  picks the newest model per family and compares it with the pins; `api/scripts/check-latest-models.ts`
  imports the pins from `claude.ts` (no source parsing), lists models with the SDK, prints JSON;
  `.github/workflows/model-watch.yml` runs it weekly and on demand and opens or comments on one
  issue. Rejected: running the check only inside `/deploy-swa` (fires only when the owner ships).
  The key is a separate repo secret — §9 Q2.
- **D-9 Amend Design.md** (§4.1 AI row, the Phase 12 line at `:964`): the policy becomes "newest
  Sonnet (default) + newest Haiku (PDF batches), pinned in `claude.ts`, weekly drift alert". This
  makes the spec `risky` for the League; it is human-built anyway (D-8 touches `.github/` and
  `api/scripts/`).

## 4. Contract

No route, row-key, cookie or i18n change. Seams: `claude` (interface `ClaudeClient` unchanged,
`claude.ts:45`), `logger`.

`api/src/shared/claude.ts` — new and changed exports:

```ts
export const SONNET_MODEL = "claude-sonnet-5-5";
export const HAIKU_MODEL = "claude-haiku-5-5";

export class ClaudeRefusalError extends Error {
  constructor(public readonly category: string | null, public readonly model: string) { ... }
}
export class ClaudeTruncatedError extends Error {
  constructor(public readonly model: string) { ... }
}

/** Pure: the request body for one call. No SDK. */
export function buildMessageParams(input: {
  model: string;
  route: "extract" | "slides" | "verify-langs" | "distractors";
  content: string | Array<ContentBlockParam>;
}): MessageParamsShape;

/** Pure: the reply text, or a typed error. */
export function textFromMessage(
  msg: { stop_reason: string | null; stop_details?: { category?: string | null } | null;
         content: Array<{ type: string; text?: string }> },
  model: string,
): string;
```

`buildMessageParams` returns `{ model, max_tokens: route === "distractors" ? 4000 : 16000,
output_config: { effort: "low" }, messages: [{ role: "user", content }] }`, plus `betas:
["server-side-fallback-2026-07-01"]` and `fallbacks: "default"` when `model === SONNET_MODEL`. It
never sets `thinking`, `temperature`, `top_p`, `top_k` or an assistant prefill. Example (a photo):

```json
{ "model": "claude-sonnet-5-5", "max_tokens": 16000, "output_config": { "effort": "low" },
  "betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default",
  "messages": [{ "role": "user", "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "…" } },
    { "type": "text", "text": "You are extracting study cards…" } ] }] }
```

`textFromMessage`: `stop_reason === "refusal"` → throw `ClaudeRefusalError(stop_details?.category ??
null, model)`; `"max_tokens"` → throw `ClaudeTruncatedError(model)`; otherwise the first block whose
`type === "text"`, or `""` (then `parseCards` throws `ClaudeJsonParseError`, as today).
`createClaudeClient` (still `v8 ignore`d) sends every call through one private `send(params)` using
`client.beta.messages.create` and reads it with `textFromMessage`.

`POST /api/cards/import` — `handleClaudeError` (`cards-import.ts:249`) gains two branches, before
the existing ones:

| Thrown | Status | Body | Log (`logger.warn`, primitives only) |
|---|---|---|---|
| `ClaudeRefusalError` | 422 | `{ "error": "Claude declined this file", "reason": "refusal", "category": "<cat or null>" }` | `cards_import_claude_refused` `{ userId, courseId, mimeType, model, category }` |
| `ClaudeTruncatedError` | 422 | `{ "error": "Claude reply was cut off", "reason": "truncated" }` | `cards_import_claude_truncated` `{ userId, courseId, mimeType, model }` |
| `ClaudeJsonParseError` | 422 | unchanged (`{ error, raw }`) | none (unchanged) |

Nothing is persisted on any of these paths (invariant 3). `POST /api/cards/enrich` is unchanged: any
throw is already a 502 (`cards-enrich.ts:105`).

`api/src/shared/model-catalog.ts` (new, pure):

```ts
export type Family = "sonnet" | "haiku";
export interface ListedModel { id: string; created_at: string }
export function pickNewest(models: ListedModel[], family: Family): ListedModel | null;
export function findStale(
  pinned: Record<Family, string>, models: ListedModel[],
): Array<{ family: Family; pinned: string; newest: string | null; reason: "newer" | "pin-missing" }>;
export function formatIssueBody(stale: ReturnType<typeof findStale>): string;
```

A family matches by id prefix `claude-sonnet-` / `claude-haiku-` only (never opus, fable, mythos);
newest by `created_at`, ties broken by id. A family is stale when its newest id differs from the pin
and is newer, or when the pin is not listed at all.

`api/scripts/check-latest-models.ts` (new CLI, run as `npx tsx scripts/check-latest-models.ts` from
`api/`): reads `ANTHROPIC_API_KEY` from the environment, iterates `client.models.list()`, prints
`{ "pinned": {...}, "newest": {...}, "stale": [...], "issueBody": "..." }` to stdout. Exit 0 when the
check ran (stale or not), 2 on a missing key or an API error (message names the failure, never the
key).

`.github/workflows/model-watch.yml` (new): `on: schedule` (`0 6 * * 1`) and `workflow_dispatch`;
`permissions: contents: read, issues: write`; steps: checkout, setup-node 20, `npm --prefix api ci
--no-audit --no-fund`, run the CLI with `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_MODELS_API_KEY }}`;
when `stale` is non-empty, `gh issue list --state open --search "Newer Claude model available
in:title"` — comment on the hit, or `gh issue create` with the title "Newer Claude model available"
and `issueBody`. No labels, and the file must not name the League's labels (same rule as `ci.yml`).

## 5. Test plan (write first)

- AC1: the pins name the newest Sonnet and Haiku
  - test file: api/src/shared/claude.test.ts
  - test name: "pins the newest models: SONNET_MODEL is claude-sonnet-5-5 and HAIKU_MODEL is claude-haiku-5-5"
  - seams touched: none
  - edge cases: no date suffix
- AC2: every request sets low effort, thinking headroom, and fallback only on Sonnet
  - test file: api/src/shared/claude.test.ts
  - test names: "extraction params use effort low and max_tokens 16000 with the file block before the prompt";
    "PDF extraction sends a document block"; "distractor params use max_tokens 4000";
    "Sonnet params carry fallbacks 'default' and the server-side-fallback-2026-07-01 beta";
    "Haiku params carry neither fallbacks nor betas";
    "params never set thinking, temperature, top_p, top_k or an assistant prefill"
  - seams touched: none (pure)
  - edge cases: `route: "slides"` and `"verify-langs"` with a string content
- AC3: the reply is read by block type, and refusals and truncation are typed
  - test file: api/src/shared/claude.test.ts
  - test names: "textFromMessage returns the text block when thinking blocks come first";
    "throws ClaudeRefusalError with stop_details.category on stop_reason refusal";
    "throws ClaudeRefusalError with category null when stop_details is missing";
    "throws ClaudeTruncatedError on stop_reason max_tokens";
    "returns an empty string for end_turn with no text block, so parseCards still throws ClaudeJsonParseError"
  - seams touched: none (pure)
  - edge cases: a `fallback` content block before the text (server-side fallback served the reply)
- AC4: the import endpoint maps the typed errors to 422, logs why, and persists nothing
  - test file: api/src/functions/cards-import.test.ts
  - test names: "a Claude refusal returns 422 with reason refusal and its category and persists nothing";
    "a cut-off Claude reply returns 422 with reason truncated and persists nothing";
    "logs cards_import_claude_refused with userId, courseId, mimeType, model and category but never the file or prompt";
    "logs cards_import_claude_truncated with userId, courseId, mimeType and model"
  - seams touched: claude (`FakeClaudeClient.nextError`), logger (fake logger), tables (assert no writes)
  - edge cases: the existing "PDF routes to HAIKU_MODEL" (`:503`), "image routes to SONNET_MODEL"
    (`:512`) and unparseable-JSON 422 tests stay green unchanged
- AC5: the drift check finds a newer Sonnet or Haiku and nothing else
  - test file: api/src/shared/model-catalog.test.ts
  - test names: "pickNewest returns the most recently created claude-sonnet model";
    "pickNewest ignores opus, fable, mythos and the other family";
    "pickNewest returns null when the family is not listed";
    "findStale reports a family whose newest model is newer than the pin";
    "findStale reports nothing when both pins are the newest";
    "findStale reports a pin the Models API no longer lists as pin-missing";
    "formatIssueBody names the pinned and the newest id for every stale family"
  - seams touched: none (pure)
  - edge cases: equal `created_at` (tie broken by id); dated and undated ids of one release both listed
- AC6 (operator): live imports on the new models return candidates within the time budget
  - check: `/dev-start`, then one photo, one PDF (several batches) and one PPTX through Import Review
  - pass: candidates arrive for all three; every PDF batch and the photo finish in under 30 s
  - seams touched: real Claude (billed)
- AC7 (operator): the workflow runs
  - check: `workflow_dispatch` once after the secret is set; right after the bump it reports no stale
    family and opens no issue

## 6. Tasks

1. **Move to the 5.5 models** (risky — `claude.ts`): pins, `buildMessageParams`, `textFromMessage`,
   the two error classes, `createClaudeClient` switched to them and to `client.beta.messages.create`
   (AC1–AC3). Pins and params land together: `effort` errors on Haiku 4.5, so they cannot ship apart.
2. **Map the typed errors in cards-import** (low-risk — handler): two branches and two log events
   (AC4). Ship with slice 1: alone, slice 1 turns refusals into a logged 502 ("Claude is unavailable").
3. **Drift logic** (low-risk — `model-catalog.ts` + test, AC5).
4. **CLI + workflow** (human build — `api/scripts/`, `.github/`): `check-latest-models.ts`,
   `model-watch.yml`; operator creates the repo secret `ANTHROPIC_MODELS_API_KEY` (AC7).
5. **Design.md + docs** (§12).
6. **Operator:** `/local-smoke`, the live probe (AC6), deploy, `workflow_dispatch` (AC7).

## 7. Verification

- `npm run test:api && npm run test:frontend` green; Tier A 90% per file on `claude.ts` and
  `model-catalog.ts` (the `createClaudeClient` block stays `v8 ignore`d), handler files Tier A.
- `npm run build` green (both projects); `npm run validate:specs`.
- `cd api && ANTHROPIC_API_KEY=… npx tsx scripts/check-latest-models.ts` → exit 0, `stale: []`.
- Operator: `/local-smoke`; `/dev-start` + AC6 (time each PDF batch from the Functions log);
  `/deploy-swa` probes; one `workflow_dispatch` of "Model watch" (AC7).
- Re-baseline cost after a week of imports (new tokenizer, new prices, thinking tokens at `low`).

## 8. Later, not in this spec

- An extraction-quality eval (golden photos/PDFs with expected candidates) so each future bump is
  measured, not eyeballed — Claude Code's `claude-api build-eval` flow.
- Haiku for photos too, if that eval shows parity (about ten times cheaper).
- An app-setting override for an emergency model rollback without a deploy.
- Let the League draft the bump spec from the alert issue automatically.
- Prompt caching once the shared prompt prefix passes the 5.5 models' 512-token minimum.

## 9. Risks and open questions

Owner decisions (the scoping round was skipped; each has the default the build takes):

- **Q1 — runtime auto-switch instead of pin + alert?** Default: pin + alert (D-1). Flipping it is a
  separate spec: a `models.list()` resolver in the composition root with the pins as fallback.
- **Q2 — where the alert's key lives.** Default: repo secret `ANTHROPIC_MODELS_API_KEY`, a separate
  key (ideally its own workspace with a low spend limit — listing models is free), never the
  production `ANTHROPIC_API_KEY`. If no GitHub secret is wanted: run the CLI from `/deploy-swa`
  instead (operator edit to `.claude/skills/deploy-swa/SKILL.md`) and drop the workflow.
- **Q3 — server-side fallback on Sonnet (D-7).** Default: on. It only reroutes `cyber` /
  `frontier_llm` declines, unlikely for vocabulary; strike it to keep the plain endpoint.

Risks:

- **R1 PDF batch latency with thinking on.** Default: if any batch exceeds 30 s in AC6, send
  `thinking: { type: "disabled" }` on Haiku calls (accepted on Haiku 5.5 at `low`/`medium`/`high`).
  Same for a slow photo on Sonnet: `thinking: { type: "between_tools" }` (Sonnet 5.5 only, effort
  `high` or below, no other field in `thinking`).
- **R2 Extraction quality changes** (distractors, language detection). Default: compare AC6
  candidates by eye with what 4.6 produced; if clearly worse, revert slice 1 (one commit) and open an
  eval task (§8).
- **R3 Refusals on benign school content** (`general_harms` can misfire). Default: logged with
  category, user sees the existing parse message; review the log after a week.
- **R4 More tokens per text** (~30%). Covered by D-5; cost re-baselined (§7).
- **R5 Model naming changes** (a future family not prefixed `claude-sonnet-`/`claude-haiku-`).
  Default: the check reports `pin-missing` once the pinned id disappears, which still opens the issue.
- **R6 Preserved thinking / history editing:** not applicable — every call is single-turn, nothing
  is replayed.

## 10. Files

Changed: `api/src/shared/claude.ts`, `api/src/shared/claude.test.ts`,
`api/src/functions/cards-import.ts`, `api/src/functions/cards-import.test.ts`, `Design.md`,
`docs/setup.md`. New: `api/src/shared/model-catalog.ts`, `api/src/shared/model-catalog.test.ts`,
`api/scripts/check-latest-models.ts`, `.github/workflows/model-watch.yml`. Fakes: none new
(`FakeClaudeClient.nextError` and the existing fake logger suffice). No `package.json` or lockfile
change.

## 11. Definition of Done

- [x] Tests named per AC1–AC5 exist and pass; AC6 and AC7 recorded in "Built, deviations"
- [x] Tier A 90% per file on `claude.ts`, `model-catalog.ts`, `cards-import.ts`
- [x] The four invariants hold: `__meta__` tests pass; import never persists on the new 422 paths;
      logs carry `userId`, never tokens, file content or prompts
- [x] `/security-scan` full pass (touches `ClaudeClient`)
- [ ] Repo secret `ANTHROPIC_MODELS_API_KEY` created and one `workflow_dispatch` run green — open operator step (§12)
- [x] `docs/changelog.md` bullet, `docs/setup.md` secret step, `Design.md` amendment,
      `PROGRESS.md` section; spec `status: implemented` + "12. Built, deviations"

## 12. Built, deviations (2026-10-19)

Built by hand on `build/latest-claude-models` (owner: "just build it here"), one commit per slice:
`e3a5271` (slice 1), `e1d733c` (slice 2), `bde02fd` (slice 3), `c0621e9` (slice 4), plus the docs
commit. §9 Q1–Q3 were taken at their defaults: pin + weekly alert, a separate repo secret, server-side
fallback on Sonnet.

**Verified (final tree):**

- `npm run test:api` → 1018 passed, 1 skipped (70 files + 1 skipped; +32 tests). Tier A per file:
  `claude.ts` 100% lines / 100% branches; `model-catalog.ts` 100% lines / 96.2% branches;
  `cards-import.ts` 99% lines / 96.3% branches.
- `npm run test:frontend` → 659 passed (unchanged).
- `npm run build` → exit 0; `tsc -p tsconfig.json` and `tsc -p tsconfig.test.json` → exit 0 (the beta
  `create` call, the content-block literals and `textFromMessage(BetaMessage)` type-check against SDK
  0.135.0). The CLI is outside `tsconfig.test.json`, so it was type-checked on its own
  (`tsc --strict --module NodeNext`) → exit 0.
- `node scripts/validate-specs.js` → ok.
- **Live:** `npx tsx scripts/check-latest-models.ts` against the Models API → exit 0,
  `newest: { sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" }`, `stale: []` — the pins are
  the newest models on 2026-10-19. Missing key → exit 2, a stderr message, nothing on stdout.
- `model-watch.yml` parses (1 job, 5 steps, `schedule` + `workflow_dispatch`) and names no League
  label.
- `/security-scan` → PASS; the invariant meta-tests (`src/__meta__`, 29) pass;
  `npm audit --audit-level=high` → exit 0 in both projects.

**AC → test traceability:**

| AC | Test file | Tests |
|---|---|---|
| AC1 pins | `api/src/shared/claude.test.ts` | "pins the newest models: SONNET_MODEL is claude-sonnet-5-5 and HAIKU_MODEL is claude-haiku-5-5" |
| AC2 request params | `api/src/shared/claude.test.ts` | "extraction params use effort low and max_tokens 16000 with the file block before the prompt", "PDF extraction sends a document block", "distractor params use max_tokens 4000", "slides and language-check params take a plain string prompt", "Sonnet params carry fallbacks 'default' and the server-side-fallback-2026-07-01 beta", "Haiku params carry neither fallbacks nor betas", "params never set thinking, temperature, top_p, top_k or an assistant prefill" |
| AC3 reply reading | `api/src/shared/claude.test.ts` | "textFromMessage returns the text block when thinking blocks come first", "returns the text after a fallback block …", "throws ClaudeRefusalError with stop_details.category on stop_reason refusal", "… with category null when stop_details is missing", "throws ClaudeTruncatedError on stop_reason max_tokens", "returns an empty string for end_turn with no text block, so parseCards still throws ClaudeJsonParseError" |
| AC4 import handler | `api/src/functions/cards-import.test.ts` | "a Claude refusal returns 422 with reason refusal and its category and persists nothing", "a refusal without a category reports category null", "a cut-off Claude reply returns 422 with reason truncated and persists nothing", "logs cards_import_claude_refused with userId, courseId, mimeType, model and category but never the file or prompt", "logs cards_import_claude_truncated with userId, courseId, mimeType and model"; AC90/AC91 routing and AC13 unparseable-JSON stay green |
| AC5 drift logic | `api/src/shared/model-catalog.test.ts` | the seven named in §5, plus "pickNewest breaks a created_at tie by id", "reports pin-missing with newest null when the whole family is gone", "treats a dated and an undated id of one release as the same release", "returns an empty string when nothing is stale", two `buildReport` tests |
| AC6 live imports | operator | open — see below |
| AC7 workflow run | operator | open — see below (the CLI itself was verified live) |

**Deviations:**

- **D1 Two extra pure exports.** `buildExtractContent` (claude.ts) moves the file-block assembly out of
  the `v8 ignore`d wrapper so AC2's "file block before the prompt" and "PDF sends a document block"
  are testable; `buildReport` (model-catalog.ts) builds the CLI's JSON so the report is tested and the
  CLI stays a thin shell. §4 listed neither.
- **D2** `buildMessageParams` returns the SDK's own `Anthropic.Beta.Messages.MessageCreateParamsNonStreaming`
  (§4's `MessageParamsShape` was a placeholder).
- **D3 More tests than §5,** listed in the table; the "never set" test also asserts no `system` key.
- **D4 The live CLI check used the local production key** from `api/local.settings.json` — one free,
  read-only Models API list call, key never printed. The workflow itself uses the separate
  `ANTHROPIC_MODELS_API_KEY` (§9 Q2).
- **D5 `/local-smoke` not run:** the boot path is unchanged (`createClaudeClient(apiKey)` keeps its
  signature; the composition root is untouched) and the smoke does not exercise Claude. The live
  import probe (AC6) is the check that matters here.

**Operator steps still open:**

- **AC7** — create a separate Anthropic key (own workspace, low spend limit), store it as the repo
  secret `ANTHROPIC_MODELS_API_KEY`, then Actions → Model watch → Run workflow; expect "Pins are
  current" and no issue (`docs/setup.md` § Model watch).
- **AC6** — `/dev-start`, then import one photo, one multi-batch PDF and one PPTX through Import Review;
  candidates arrive for all three, and each PDF batch and the photo finish in under 30 s (Functions
  log). If not, apply §9 R1.
- Merge (push to `main` deploys), then `/deploy-swa`.
- After a week: review `cards_import_claude_refused` / `_truncated` logs and re-baseline cost.

## 13. Proposed edits to other files (applied 2026-10-19, see section 12)

- `docs/changelog.md`: "- Card import now runs on the **newest Claude models** — `claude-sonnet-5-5`
  (photos, slides, language check, distractors) and `claude-haiku-5-5` (PDF batches), up from Sonnet
  4.6 / Haiku 4.5 and cheaper per token. Every call sets effort `low` with room for thinking
  (`max_tokens` 16000/4000), Sonnet calls carry server-side fallback, and refusals or cut-off replies
  are typed and logged (`cards_import_claude_refused` / `_truncated`) instead of failing as a parse
  error. A weekly **Model watch** workflow opens an issue when a newer Sonnet or Haiku ships. Spec:
  [specs/7-latest-claude-models.md](specs/7-latest-claude-models.md)."
- `PROGRESS.md`: remove the Open-specs line; add `## Post-v1 — Newest Claude models + model watch`
  with `Spec: [docs/specs/7-latest-claude-models.md](docs/specs/7-latest-claude-models.md) (#7)`, the
  slices and the test totals.
- `Design.md` §4.1 AI row → `| **AI** | Anthropic Claude API — newest Sonnet (default) + newest Haiku
  (PDF batches), pinned in api/src/shared/claude.ts; weekly drift alert | Photo OCR + cards +
  distractors in one call |`; `Design.md:964` → "Uses the newest Sonnet, pinned in
  `api/src/shared/claude.ts` (a weekly workflow reports newer releases — see spec #7)".
- `docs/setup.md`: a "Model watch" step — create a separate Anthropic key (own workspace, low spend
  limit) and store it as the repo secret `ANTHROPIC_MODELS_API_KEY`.
- No `docs/user-guide.md` change (nothing family-visible).
