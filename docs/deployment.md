# Deployment runbook — LexiQuest

How to ship LexiQuest to production on Azure Static Web Apps (SWA), and
how to keep a local snapshot so dev can mirror live without ever writing
back to it.

This runbook supersedes the brief "Azure production deployment" section
in [setup.md](setup.md).

Three sections, in the order an operator would do them:

1. [One-time Azure setup](#1-one-time-azure-setup) — done once, then
   forgotten about.
2. [Day-to-day deploy](#2-day-to-day-deploy) — what happens every time
   you push to `main`.
3. [Backup + dev-from-live](#3-backup--dev-from-live) — snapshot prod,
   load it into Azurite locally, never accidentally write to live.

A short [pre-public-GitHub safety gate](#4-pre-public-github-safety-gate)
appendix at the end covers the one-time check before flipping the repo
to public.

---

## 1. One-time Azure setup

### 1a. Create the Azure resources

Names below are suggestions — the only thing the deploy pipeline cares
about is the SWA deployment token (set in step 1c).

| Resource | Suggested name | Notes |
|---|---|---|
| Resource group | `rg-lexiquest` | Region close to your users |
| Storage account | `stlexiquest` | Standard LRS is fine; tables only |
| Static Web App | `swa-lexiquest` | Linked to this GitHub repo, branch `main` |

Recommended on the storage account: enable **table soft-delete** with
7–30 day retention. This is the only undo for an accidental write.

Custom domain on SWA + free TLS cert is optional and can be added later.

### 1b. SWA deployment token → GitHub secret

In the Azure portal: SWA resource → **Manage deployment token** → copy.

In GitHub: repo Settings → Secrets and variables → Actions → New
repository secret → name `AZURE_STATIC_WEB_APPS_API_TOKEN`, paste value.

This is the only secret the workflow ([azure-static-web-apps.yml](../.github/workflows/azure-static-web-apps.yml))
consumes from GitHub. Everything else lives in SWA app settings.

### 1c. SWA application settings

In the Azure portal: SWA resource → **Configuration** → Application
settings. Add:

| Key | Value |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Storage account connection string (Storage account → Access keys → key1 connection string) |
| `SESSION_SECRET` | Fresh 32-byte random — `openssl rand -hex 32`. **Do not** reuse the dev value |
| `ANTHROPIC_API_KEY` | Real Anthropic API key (`sk-ant-…`) |
| `PASSWORD_WALDO` | Production password for the Waldo seed user |
| `PASSWORD_LEX` | Production password for Lex |
| `PASSWORD_MATS` | Production password for Mats |
| `PASSWORD_BEN` | Production password for Ben |

Leave `COOKIE_SECURE` unset — it defaults to `Secure` on, which is what
we want over HTTPS.

### 1d. Seed prod once

The four family accounts and the current school year are created via
the seed script. Run it locally with prod creds in your shell — never
commit them, and unset them when done.

```sh
cd api
AZURE_STORAGE_CONNECTION_STRING='<prod connection string>' \
PASSWORD_WALDO='<real>' PASSWORD_LEX='<real>' \
PASSWORD_MATS='<real>' PASSWORD_BEN='<real>' \
npm run seed

unset AZURE_STORAGE_CONNECTION_STRING PASSWORD_WALDO PASSWORD_LEX PASSWORD_MATS PASSWORD_BEN
```

The script is idempotent — safe to re-run.

---

## 2. Day-to-day deploy

The pipeline is push-to-main. There is no manual step.

### Pre-flight (do this before pushing)

```sh
cd api      && npm test
cd frontend && npm test
```

Then run `/local-smoke` (boots the real SWA + Functions stack against
Azurite and exercises the critical paths) and `/security-scan`.

### Ship

```sh
git push origin main
```

GitHub Actions builds `frontend/` and `api/` and pushes the bundle to
SWA. The run is visible at:
`https://github.com/<owner>/<repo>/actions` — usually green in 3–5
minutes.

After it goes green, hit the live URL and log in once to confirm.

### Use the skill

Or run `/deploy-swa` — it pushes, watches the GitHub Actions run, and
probes the live URL when the deploy finishes.

---

## 3. Backup + dev-from-live

The flow:

1. Snapshot prod → `backups/lexiquest-<date>.json` (gitignored).
2. Load that snapshot into Azurite locally.
3. Run dev as usual. All real cards and progress are visible. Live is
   never touched.

### 3a. Snapshot prod (`npm run export-all`)

Read-only. Reads from a deliberately-different env var
(`AZURE_STORAGE_CONNECTION_STRING_SOURCE`) than the runtime
`AZURE_STORAGE_CONNECTION_STRING`, so a misconfigured shell can't point
the export at the wrong place.

```sh
cd api
AZURE_STORAGE_CONNECTION_STRING_SOURCE='<prod connection string>' \
  npm run export-all -- --yes

unset AZURE_STORAGE_CONNECTION_STRING_SOURCE
```

Output: `backups/lexiquest-<ISO-date>.json` at the repo root.

The script:
- Refuses to run without `--yes`.
- Refuses to run without the env var.
- Iterates the six tables (`users`, `years`, `courses`, `cards`,
  `attempts`, `sessions`) and lists every entity.
- Writes a `{ exportedAt, source, tables }` JSON file.
- Never writes to the storage account.

The snapshot contains real password hashes — `backups/` is gitignored.
Keep these files off shared drives.

### 3b. Load into Azurite (`npm run import-local`)

Hard-refuses to run unless `AZURE_STORAGE_CONNECTION_STRING` points at
Azurite (the slice-1 safety latch). For each of the six tables: delete
+ recreate + bulk insert.

```sh
azurite --silent --location /tmp/azurite      # in another terminal
cd api
AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true \
  npm run import-local -- ../backups/lexiquest-<date>.json
```

Idempotent — running it twice yields the same state.

### 3c. Run dev

`npm run dev` and `swa start` as in [setup.md](setup.md). All cards,
courses, sessions, and badges from the snapshot are visible. Logging
in uses the real prod passwords (since the password hashes were
restored verbatim).

### 3d. Recovery

Restoring a snapshot back to prod is **not** automated. Doing so via
script is intentionally hard — it is too easy to nuke a week of kids'
progress in one keystroke. If recovery is ever needed, do it manually
via Azure Storage Explorer, or write a one-shot script and have a
second person review it before running.

---

## 4. Pre-public-GitHub safety gate

One-time check before flipping the repo to public visibility.

```sh
# Must be empty:
git log --all --full-history -- api/local.settings.json

# Must be empty:
git log --all -p | grep -E 'sk-ant-|SESSION_SECRET=|AccountKey=' | head

# Run on HEAD:
/security-scan
```

If anything turns up: rotate the leaked key (Anthropic console,
regenerate `SESSION_SECRET`, regenerate Azure Storage account keys via
the Azure portal) and either purge with `git filter-repo` or accept
the rotation as sufficient mitigation. Document the decision in
[changelog.md](changelog.md).

After the flip: in GitHub repo settings, add a branch protection rule
on `main` requiring a passing CI run before merge.

---

## Out of scope (next steps, not built yet)

- **Nightly automated backup** — a GitHub Actions cron + private backup
  repo. The manual `npm run export-all` covers the stated need; this
  would just trade operator effort for two more secrets to manage.
- **Staging slot** — a second SWA environment for pre-prod validation.
  Useful but not asked for.
- **Programmatic restore-to-prod** — intentionally manual. See §3d.
