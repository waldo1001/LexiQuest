# LexiQuest — Production Deployment + Live→Dev Snapshot Plan

## Context

LexiQuest is feature-complete (through post-v1 gaming + per-upload stats) and the
GitHub Actions → Azure SWA pipeline is wired ([.github/workflows/azure-static-web-apps.yml](../../.github/workflows/azure-static-web-apps.yml)),
but there is no end-to-end production runbook. Four things are needed before
the kids can use it:

1. **Public-GitHub safety**: the repo will be made public — no leaked secrets in
   working tree or git history.
2. **Live deploy**: a documented, reproducible deploy via the existing GitHub
   Actions pipeline, with all prod secrets set in SWA app settings.
3. **Local backup of live**: a one-command snapshot of all production tables to
   a date-stamped JSON file on the operator's machine.
4. **Dev-from-live**: load that snapshot into Azurite so local dev sees real
   cards/data — without any chance of writing back to live by accident.

The architecture is already well-suited: `AzureTableStorage` ([api/src/shared/azure-table-storage.ts](../../api/src/shared/azure-table-storage.ts))
talks to either Azurite or a real Azure account purely via connection string,
and `.gitignore` already excludes `local.settings.json`, `.env*`, `*.pem`, and
`.azure/`. The missing pieces are tooling (export/import scripts), one-time
Azure setup, and documentation.

## Critical files — current state (read-only reference)

- [api/index.ts:39-42](../../api/index.ts) — composition root, reads `AZURE_STORAGE_CONNECTION_STRING`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `COOKIE_SECURE`
- [api/local.settings.json.example](../../api/local.settings.json.example) — env-var template (the real `local.settings.json` is gitignored)
- [api/scripts/seed.ts](../../api/scripts/seed.ts) — already env-driven, will be the pattern for the new scripts
- [api/src/shared/table-partitions.ts](../../api/src/shared/table-partitions.ts) — six tables: `users`, `years`, `courses`, `cards`, `sessions`, `attempts`
- [api/src/shared/azure-table-storage.ts](../../api/src/shared/azure-table-storage.ts) — the seam used by everything; reusable from scripts
- [api/src/functions/export.ts](../../api/src/functions/export.ts) — per-user JSON export (used by the in-app download button; **not** what the snapshot script will use — too narrow)
- [.gitignore](../../.gitignore) — already excludes the right things
- [.github/workflows/azure-static-web-apps.yml](../../.github/workflows/azure-static-web-apps.yml) — deploy pipeline, push-to-main triggered
- [.claude/skills/security-scan/SKILL.md](../../.claude/skills/security-scan/SKILL.md) — secret-pattern blocklist (run before going public)
- [docs/setup.md](../setup.md) — has minimal prod-deploy notes; will be superseded by the new runbook

## Plan

### Part A — New scripts (under `api/scripts/`)

Both reuse `AzureTableStorage` from the seam — no duplicate Table-Storage code.

1. **`api/scripts/export-all.ts`** — read-only snapshot of every table.
   - Reads `AZURE_STORAGE_CONNECTION_STRING_SOURCE` (deliberately a different
     name than the runtime `AZURE_STORAGE_CONNECTION_STRING`, so a misconfigured
     shell can't accidentally point export at Azurite or read from the wrong
     place).
   - Iterates the six known tables (loop over `Object.keys(PARTITIONS) ∪ Object.keys(USER_OWNED_PARTITION)` from `table-partitions.ts`).
   - For each: list all entities (`tables.list({ table })`) and accumulate.
   - Print `READING FROM: <accountName-or-Azurite>` and require `--yes` to proceed.
   - Write `backups/lexiquest-<ISO-date>.json` with shape:
     ```json
     { "exportedAt": "2026-04-25T...", "source": "<accountName>", "tables": { "users": [...], "years": [...], "courses": [...], "cards": [...], "sessions": [...], "attempts": [...] } }
     ```
   - **Never writes** anywhere. Pure read.

2. **`api/scripts/import-local.ts`** — load a snapshot into Azurite.
   - Reads the runtime `AZURE_STORAGE_CONNECTION_STRING`.
   - **Hard refuses** to run if that string is anything other than
     `UseDevelopmentStorage=true` (or starts with `DefaultEndpointsProtocol=http;` pointing at `127.0.0.1`/`localhost`). This is the safety latch.
   - Accepts a backup path arg: `npm run import-local -- backups/lexiquest-2026-04-25.json`.
   - Truncates each of the six tables (delete + recreate) before loading, so
     repeated runs are idempotent.
   - Prints `WRITING TO: Azurite (local)` and counts per table on success.

3. **`api/package.json`** — add scripts:
   ```
   "export-all":   "tsx scripts/export-all.ts",
   "import-local": "tsx scripts/import-local.ts"
   ```
   (matches the existing `seed` pattern.)

4. **`backups/`** added to `.gitignore` (the exports contain real password
   hashes — must never be committed even on a public repo).

5. **TDD coverage** — both scripts get the `/* v8 ignore start … end */` wrap
   (same as `seed.ts`), but the *truncate-before-load* and *Azurite-only guard*
   logic is extracted into a small pure helper in `api/src/shared/` with unit
   tests (the guard has real safety value, so it deserves a test).

### Part B — `docs/deployment.md` (new) — the runbook

A single page in three sections, in the order an operator would do them.

**B1. One-time setup (do once, never again)**
- Create resource group `rg-lexiquest`, Storage Account `stlexiquest` (Standard LRS).
- Enable **table soft-delete** (7–30 day retention) on the storage account.
- Create the SWA resource pointing at the GitHub repo (or use the existing one).
- Copy the SWA deployment token → GitHub repo Settings → Secrets → `AZURE_STATIC_WEB_APPS_API_TOKEN`.
- In SWA → Configuration → Application settings, add:
  - `AZURE_STORAGE_CONNECTION_STRING` (from the storage account)
  - `SESSION_SECRET` (fresh 32-byte random — `openssl rand -hex 32`; **not** the dev value)
  - `ANTHROPIC_API_KEY`
  - Per-user seed passwords: `PASSWORD_WALDO`, `PASSWORD_LEX`, `PASSWORD_MATS`, `PASSWORD_BEN`
- One-time prod seed: locally, `AZURE_STORAGE_CONNECTION_STRING=<prod> PASSWORD_WALDO=… PASSWORD_LEX=… … npm run seed` from `api/`. Unset the env var when done.
- Optional: Custom domain in SWA + free TLS cert.

**B2. Day-to-day deploy**
- Pre-flight: `npm test` in both `api/` and `frontend/`, `/local-smoke`, `/security-scan`.
- `git push origin main` → GitHub Actions builds `frontend/` + `api/` and pushes to SWA.
- Watch the run in Actions; verify the live URL after ~3–5 min.

**B3. Backup + dev-from-live workflow**
- Snapshot prod: `AZURE_STORAGE_CONNECTION_STRING_SOURCE=<prod> npm run export-all -- --yes` → `backups/lexiquest-<date>.json`.
- Load into Azurite: start Azurite, then `npm run import-local -- backups/lexiquest-<date>.json`.
- Run `npm run dev` / `swa start` as today. All cards, courses, sessions, badges visible — **and** Azurite is the only target. Live is untouched.
- Recovery: restoring a snapshot back to prod is **not** automated (intentionally — too easy to nuke a week of kids' progress). If ever needed, do it manually via Azure Storage Explorer or write a one-shot script.

### Part C — Pre-public-GitHub safety gate

Before running `gh repo edit --visibility public`:

1. **Verify nothing secret was ever committed**:
   - `git log --all --full-history -- api/local.settings.json` → must be empty.
   - `git log --all -p | grep -E 'sk-ant-|SESSION_SECRET=|AccountKey=' | head` → must be empty.
   - Run `/security-scan` once on `HEAD`.
2. **If anything turns up**: rotate the leaked key (Anthropic console, regenerate `SESSION_SECRET`, regenerate storage account keys) and either purge with `git filter-repo` or accept the rotation as sufficient mitigation. Document the decision in `docs/changelog.md`.
3. **Branch protection** on `main`: require a passing CI run before merge (the SWA workflow already runs on PRs).

### Part D — Update `.claude/skills/security-scan/SKILL.md` (only if needed)

Confirm the existing scan already flags `backups/` if accidentally tracked. If
not, add `backups/**` to the path-blocklist. (Likely already covered by the
broad `.env`/`local.settings.json` patterns plus the new `.gitignore` line; do
the lazy check during execution.)

### Part E — Out of scope

- Automated nightly backup via GitHub Actions cron + private backup repo —
  called out as a clear next step in `docs/deployment.md`, but not built in
  this slice. The manual `npm run export-all` covers the stated need
  ("local backup").
- Staging slot / second SWA environment — useful but not asked for.
- Programmatic restore (snapshot → prod). Intentionally manual.

## Open questions / assumptions

- **Assumption**: existing [api/scripts/seed.ts](../../api/scripts/seed.ts)
  is the right precedent — env-driven, `/* v8 ignore */`-wrapped,
  `AZURE_STORAGE_CONNECTION_STRING` for runtime connect. New scripts
  follow the same shape. Confirmed by reading the file.
- **Assumption**: the six tables in scope are `users`, `years`, `courses`,
  `cards`, `attempts`, `sessions` — i.e. `Object.keys(PARTITIONS) ∪
  Object.keys(USER_OWNED_PARTITION)` from [api/src/shared/table-partitions.ts](../../api/src/shared/table-partitions.ts).
  Confirmed by reading the file. If a future table is added, slice 2's
  AC5 will fail loudly rather than silently drop it.
- **Assumption**: `backups/` lives at the repo root (sibling of `api/`,
  `frontend/`, `docs/`), not inside `api/`. Justification: a snapshot is
  an artefact of operating the whole product, not of the API project.
- **Question (does not block planning)**: does the Azure resource group
  / storage account / SWA already exist, or does the Slice 5 runbook
  document a yet-to-be-executed B1? Either way the slice writes the
  doc; the *execution* of B1 happens out-of-band by the operator, not
  inside this TDD cycle.
- **Question (does not block planning)**: custom domain on SWA is
  optional (Plan B1 lists it that way). The runbook will mention it as
  a one-line follow-up, no more.

## TDD Slices

Six slices, each one TDD cycle. Numbered for autonomous execution
(commit + push per slice). Slices 1–2 are pure unit logic. Slices 3–4
are integration scripts wrapped in `/* v8 ignore start … end */` (same
precedent as [api/scripts/seed.ts](../../api/scripts/seed.ts)) — verified
manually against Azurite. Slices 5–6 are docs + verification with no
production code.

### Slice 1 — Connection-string guard helper

- **Task**: Add a pure `isAzuriteConnectionString(s)` predicate that
  returns true only when the input points at Azurite.
- **Scope IN**: One pure helper + its unit tests.
- **Scope OUT**: Any caller of the helper (slice 4 wires it in).
- **Files**:
  - `api/src/shared/connection-string-guard.ts` (NEW)
  - `api/src/shared/connection-string-guard.test.ts` (NEW)
- **Seams**: none (pure).
- **RED list**:
  - AC1: `UseDevelopmentStorage=true` (with or without trailing `;`) → true
    - test name: `"accepts UseDevelopmentStorage shorthand"`
  - AC2: `DefaultEndpointsProtocol=http;...` containing `127.0.0.1` → true
    - test name: `"accepts http endpoint pointing at 127.0.0.1"`
  - AC3: `DefaultEndpointsProtocol=http;...` containing `localhost` → true
    - test name: `"accepts http endpoint pointing at localhost"`
  - AC4: `DefaultEndpointsProtocol=https;AccountName=stlexiquest;AccountKey=...` → false
    - test name: `"rejects a real Azure storage account string"`
  - AC5: `undefined`, `""`, whitespace-only → false
    - test name: `"rejects empty or undefined input"`
  - AC6: an `https://` string that merely *contains* the substring
    `127.0.0.1` somewhere (e.g. inside an account-name segment) → false
    - test name: `"rejects an https string that merely contains 127.0.0.1 as a substring"`
- **Risks**: a too-loose regex or naive `includes("localhost")` lets a
  non-local https string slip through; pinned by AC6.

### Slice 2 — Snapshot payload builder

- **Task**: Add a pure `buildSnapshotPayload(args)` that takes the six
  table arrays plus a clock + source label and returns the canonical
  `{ exportedAt, source, tables: { … } }` shape.
- **Scope IN**: Pure builder + tests. No I/O.
- **Scope OUT**: The actual `tables.list` calls (slice 3).
- **Files**:
  - `api/src/shared/snapshot-payload.ts` (NEW)
  - `api/src/shared/snapshot-payload.test.ts` (NEW)
- **Seams**: clock (passed in as `nowIso: () => string`).
- **RED list**:
  - AC1: empty inputs produce a payload with empty arrays for every of the six known tables
    - test name: `"emits empty arrays for every known table when no entities given"`
  - AC2: provided entities are placed under their named keys verbatim
    - test name: `"places entities under their named table keys"`
  - AC3: `exportedAt` is the value returned by the injected clock
    - test name: `"stamps exportedAt from the injected clock"`
  - AC4: `source` is the passed-in label (account name or `"Azurite"`)
    - test name: `"records the source label verbatim"`
  - AC5: every key derived from `PARTITIONS ∪ USER_OWNED_PARTITION`
    appears under `tables` even when its array is omitted from input
    — no silent drop if a new table is added later
    - test name: `"includes every known table key even when input array is missing"`
- **Risks**: a future new table (e.g. badges) silently dropped — AC5
  pins this by reading the partition map.

### Slice 3 — `npm run export-all` script

- **Task**: Add `api/scripts/export-all.ts` which reads from
  `AZURE_STORAGE_CONNECTION_STRING_SOURCE`, requires `--yes`, lists
  every entity from each of the six tables, builds the payload via the
  slice-2 builder, and writes
  `backups/lexiquest-<ISO-date>.json`.
- **Scope IN**:
  - `api/scripts/export-all.ts` wrapped in `/* v8 ignore start … end */`
  - `api/package.json` — add `"export-all": "tsx scripts/export-all.ts"`
  - `.gitignore` — add `backups/`
  - `api/local.settings.json.example` — add a commented placeholder for
    `AZURE_STORAGE_CONNECTION_STRING_SOURCE`
- **Scope OUT**: import side, runbook docs.
- **Seams**: tables (real `AzureTableStorage` against Azurite).
- **RED list**: none — script body is `v8-ignore`-wrapped per the
  established `seed.ts` pattern. The pure helpers it depends on (slices
  1, 2) carry the unit-test load. **Integration verification**:
  - With Azurite running and seeded:
    `AZURE_STORAGE_CONNECTION_STRING_SOURCE=UseDevelopmentStorage=true npm run export-all -- --yes`
    → file exists, parses as JSON, has all six top-level table arrays,
    `users` and `cards` non-empty.
  - Without `--yes` → script refuses, non-zero exit.
  - Without `AZURE_STORAGE_CONNECTION_STRING_SOURCE` → clear error,
    non-zero exit.
- **Risks**: forgetting `--yes` guard would turn the script into a
  drive-by foot-gun if the env var is set in the shell. Verified
  manually as above.

### Slice 4 — `npm run import-local` script

- **Task**: Add `api/scripts/import-local.ts` which reads
  `AZURE_STORAGE_CONNECTION_STRING`, **hard-refuses** unless the slice-1
  guard says it's Azurite, then for each of the six tables: delete →
  recreate → bulk insert from the backup file.
- **Scope IN**:
  - `api/scripts/import-local.ts` wrapped in `/* v8 ignore start … end */`
    — uses `isAzuriteConnectionString` from slice 1 as the safety latch
  - `api/package.json` — add `"import-local": "tsx scripts/import-local.ts"`
- **Scope OUT**: programmatic restore-to-prod (Part E — out of scope).
- **Seams**: tables (real `AzureTableStorage` against Azurite); the
  slice-1 guard provides the safety latch.
- **RED list**: none for the script body (v8-ignore). The slice-1 guard
  carries the safety-latch unit tests. **Integration verification**:
  - Azurite running, dev `AZURE_STORAGE_CONNECTION_STRING`,
    `npm run import-local -- backups/<file>.json` → exits 0 and table
    counts match the file.
  - Re-run the same command immediately → still exits 0 and counts
    unchanged (idempotency from truncate-before-load).
  - Set `AZURE_STORAGE_CONNECTION_STRING` to
    `DefaultEndpointsProtocol=https;AccountName=fake;AccountKey=zzz;EndpointSuffix=core.windows.net`
    → script refuses with a clear message and non-zero exit.
- **Risks**: a misconfigured shell session pointing at prod is the
  catastrophic failure mode; the slice-1 guard is the only thing
  preventing it — must fail closed.

### Slice 5 — `docs/deployment.md` runbook

- **Task**: Write the operator-facing runbook covering one-time Azure
  setup (B1), day-to-day deploy (B2), backup + dev-from-live (B3), and
  the pre-public safety gate reference (Part C). Add a single pointer
  line to it from `docs/setup.md` so the existing prod-deploy notes
  there don't go stale.
- **Scope IN**:
  - `docs/deployment.md` (NEW)
  - `docs/setup.md` — add a single pointer line at the top of the
    "Production deploy" section linking to the new runbook (no content
    duplication)
- **Scope OUT**: nightly-backup automation (Part E), staging slot.
- **Seams**: none.
- **RED list**: none — pure docs slice. **Verification**:
  - `/docs-update` keeps changelog/PROGRESS in sync.
  - Cross-check every secret named in B1 against
    [.github/workflows/azure-static-web-apps.yml](../../.github/workflows/azure-static-web-apps.yml)
    — every name must match what the workflow consumes.
- **Risks**: stale Azure-portal UI flow descriptions; mitigated by
  preferring `az`-CLI commands and short pointers to MS docs over
  transcribed click-paths.

### Slice 6 — Pre-public-GitHub safety gate

- **Task**: Run the three Part-C checks against current `HEAD`, record
  the outcome in [docs/changelog.md](../changelog.md), and confirm
  `backups/**` is covered by either `.gitignore` (slice 3) or the
  security-scan blocklist. The visibility flip itself is the user's
  action, not this slice's.
- **Scope IN**:
  - Run `git log --all --full-history -- api/local.settings.json` →
    expect empty.
  - Run a full-history secret-pattern scan (`git log --all -p | grep -E
    'sk-ant-|SESSION_SECRET=|AccountKey='`) → expect empty.
  - Run `/security-scan` on `HEAD`.
  - If all clean: append a single changelog bullet recording the result
    and the date the gate passed.
  - If `backups/**` not already covered, add it to
    [.claude/skills/security-scan/SKILL.md](../../.claude/skills/security-scan/SKILL.md).
- **Scope OUT**: the visibility flip, branch protection rule creation
  (operator does these in GitHub).
- **Seams**: none.
- **RED list**: none. Verification *is* the slice. If any check fails:
  STOP, surface to user, follow Part C step 2 (rotate keys, document
  decision) before retrying.
- **Risks**: a leaked key in a long-forgotten branch. Mitigation is
  rotation, not history rewrite — documented as the chosen tradeoff in
  the changelog entry.

## Verification

End-to-end, in order:

1. **Scripts work locally**:
   - `npm test` in `api/` — new helper has unit tests, all pass.
   - With Azurite running and the dev `local.settings.json`:
     `AZURE_STORAGE_CONNECTION_STRING_SOURCE=UseDevelopmentStorage=true npm run export-all -- --yes`
     produces `backups/lexiquest-<today>.json` with all six tables present.
   - Wipe Azurite (`rm -rf __azurite_*`), restart, `npm run seed`, then
     `npm run import-local -- backups/lexiquest-<today>.json`. Re-run `npm run dev`
     and confirm the imported state is visible in the UI.
2. **Safety latch**:
   - Set `AZURE_STORAGE_CONNECTION_STRING` to a fake non-Azurite string
     (`DefaultEndpointsProtocol=https;AccountName=fake;...`) and run
     `npm run import-local` — must refuse with a clear error and exit non-zero.
3. **Public-GitHub gate**:
   - Run the three checks in Part C; all return empty.
   - `/security-scan` on `HEAD` — green.
4. **Prod deploy** (once Azure side is set up per Part B1):
   - `git push origin main`, watch Action go green.
   - Hit the live URL, log in as Waldo, see real data.
   - Run `/local-smoke` against the live URL (skill currently targets local; if
     it doesn't support a remote target, just hit `/api/me` with curl + a fresh
     login).
5. **Round-trip**:
   - Snapshot prod → import into Azurite → confirm a card edited locally does
     **not** appear in prod (proves isolation).
