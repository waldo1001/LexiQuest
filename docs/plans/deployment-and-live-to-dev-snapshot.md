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
