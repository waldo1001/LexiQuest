---
name: security-scan
description: Scan the LexiQuest workspace for secrets, credentials, and common security leaks. Runs as a mandatory step in every /tdd-cycle (after COVER, before UPDATE DOCS) and also on-demand when the user asks for a security check. Blocks the cycle if anything is found — never "note and continue".
---

# /security-scan — LexiQuest security leak checker

LexiQuest holds bcrypt password hashes for a family, an Anthropic API key
that's tied to waldo's personal credit card, an Azure Storage connection
string that grants full access to the database, and a `SESSION_SECRET` that
grants session-forgery on a leak. Every one of these must never appear in
tracked files, logs, error messages, or snapshots.

Reference:
[../../../Design.md §4.3](../../../Design.md),
[../../../docs/tdd/ai-maintainability.md §9](../../../docs/tdd/ai-maintainability.md),
[../../../docs/tdd/testability-patterns.md §6](../../../docs/tdd/testability-patterns.md).

## When to run

- **Always** as part of `/tdd-cycle` (Step 10, between COVER and UPDATE DOCS).
- **Always** before any `git commit`, `git push`, or PR creation.
- **Always** when the user explicitly asks for a security check.
- **Always** after adding new fixtures, logs, or error messages.

## The rules (what MUST NOT exist in the repo)

1. **No secrets in tracked files.** Anthropic API keys, Azure connection
   strings, `SESSION_SECRET` values, bcrypt hashes, HMAC-signed session
   tokens, any private key.
2. **No real family data** outside documentation that intentionally names
   them. The family is Waldo, Lex, Mats, Ben — these names are OK in
   `Design.md`, `README.md`, `PROGRESS.md`, and user-facing docs. They are
   NOT OK in fixtures, snapshots, test assertions, or logs. Use `Alice`,
   `Bob`, `Carol`, `Dan` there.
3. **No real card content** in fixtures. Students actually study with this
   app; leaking their questions/answers to git history is a privacy hit
   even within a family. Use `"le chien" → "the dog"` style placeholders.
4. **No sensitive files tracked.** `.env`, `.env.local`,
   `local.settings.json`, `api/local.settings.json`, `*.pem`, `*.key`,
   `*.pfx`, `*.p12`, `.azure/`.
5. **No logging of secrets.** Passwords, password hashes, bcrypt output,
   session tokens, cookie values, Claude API keys, Azure connection strings,
   full Claude request/response bodies, base64 image payloads.
6. **No secrets in error messages.** `throw new Error(\`... \${token}\`)` is
   a leak waiting to be logged.
7. **No secrets in comments or TODOs.** Especially `// temp: sk-ant-...`.

## Step 0 — Refresh the gitignore baseline

Before scanning, verify [`../../../.gitignore`](../../../.gitignore) exists
and contains at least:

```
# env + local settings
.env
.env.*
!.env.example
api/local.settings.json
frontend/.env
frontend/.env.*
!frontend/.env.example

# secrets
*.pem
*.key
*.pfx
*.p12
.azure/

# build output
node_modules/
coverage/
dist/
api/dist/
frontend/dist/

# editor
.vscode/settings.json
.DS_Store
```

If the file is missing or any rule is absent, add it before proceeding.

## Step 1 — Is anything sensitive currently staged or tracked?

Run:

```sh
git ls-files | grep -E '(^|/)(\.env($|\.)|local\.settings\.json|.*\.pem|.*\.key|.*\.pfx|.*\.p12|\.azure/)'
```

Expected output: **empty** (or only `.env.example` / `.env.*.example`). Any
other hit = immediate block. If a sensitive file is already tracked:

1. `git rm --cached <file>` — stop tracking, keep local copy.
2. Add to `.gitignore`.
3. **Rotate the secret** — regenerate the Anthropic API key, rotate the
   Azure Storage account key (forces connection-string update),
   regenerate `SESSION_SECRET` (logs everyone out — acceptable cost).
   Reset any user passwords that were in the file.
4. If ever pushed, rewrite history with `git filter-repo` (with user
   confirmation — see CLAUDE.md "executing actions with care").

## Step 2 — Pattern scan for secrets in source

Grep across the workspace (excluding `node_modules/`, `coverage/`,
`dist/`, `.git/`). Any match is a block.

**Credential shapes:**

- `sk-ant-[A-Za-z0-9_-]{20,}` — Anthropic API key.
- `AccountKey=[A-Za-z0-9+/=]{60,}` — Azure Storage account key (inside a
  connection string).
- `DefaultEndpointsProtocol=https;AccountName=` — Azure connection string.
- `\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}` — bcrypt hash.
- `eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` — JWT.
- `-----BEGIN (RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----` — PEM
  private key.
- `(?i)session[_-]?secret\s*[:=]\s*['"]\S{16,}['"]` — hardcoded HMAC secret.
- `(?i)(api[_-]?key|secret|token|password|passwd|bearer)[^a-z0-9]{1,5}['"][a-z0-9+/=_-]{16,}['"]`
  — assignment of a suspiciously long string to a secret-named var.
- `0x[a-f0-9]{40,}` / `[a-f0-9]{64}` — long hex. Inspect each hit.

**Environment variable leakage:**

- `process\.env\.[A-Z_]+` outside `api/shared/config.ts` and per-function
  composition roots (`api/*/index.ts`) — violates the config-at-boundary
  rule.

## Step 3 — Real-data scan

Grep for real identifiers that must NOT appear outside allowlisted docs:

- `waldo@` / `@dynex\.be` / `@ifacto\.be`
- waldo's real phone number, real addresses
- Real family member full names / surnames beyond first name
- Real card content from the kids' schools

**Allowed locations** (these docs name real identifiers on purpose):

- `README.md`
- `Design.md`
- `PROGRESS.md`
- `docs/setup.md`
- `docs/getting-started.md`
- `docs/user-guide.md`

**Banned locations**: `api/**`, `frontend/**`, fixtures, snapshots, tests,
changelog, any comment.

## Step 4 — Log hygiene scan

For every `logger.info|warn|error` call in `api/` and `frontend/src/`:

- First argument must be a snake_case event name string literal.
- Second argument must be a plain object with primitive values only (string,
  number, boolean). No `password`, `hash`, `token`, `cookie`, `authorization`,
  `apiKey`, `connectionString`, `imageBase64`, `raw`, `rawResponse`,
  `messageBody`.

Grep patterns (any match = leak):

- `logger\.(info|warn|error)\([^,]+,\s*\{[^}]*(password|hash|token|cookie|authorization|apikey|connection|imagebase64|raw)`
- `console\.(log|info|warn|error)` anywhere under `api/` or
  `frontend/src/` outside the composition root → bypasses the structured
  logger and can leak without redaction.

## Step 5 — Error-message scan

Grep for template literals in `throw new Error(...)` or
`new <TypedError>(...)` that interpolate variables matching secret shapes:

- `\`[^\`]*\$\{.*(?:password|hash|token|cookie|apiKey|secret|bearer).*\}` inside `throw`

Error messages should name the *userId / courseId / sessionId / operation*
(public), not the *credential* (secret).

## Step 6 — Snapshot & fixture scan

- `**/__snapshots__/**` — open each file, scan for long base64/hex blobs,
  email addresses, bcrypt prefixes, JWT prefixes.
- `**/__fixtures__/**` — every fixture must use `Alice`/`Bob`/`Carol`-style
  placeholder names, placeholder GUIDs (`00000000-...`), and synthetic card
  content. Any real-looking identifier is a block.

## Step 7 — LexiQuest invariant meta-tests

Run the meta-tests (once they exist — Phase 5+):

```sh
cd api && npx vitest run __meta__
```

These enforce:

- `auth-boundary.test.ts` — no handler reads `userId` from `req.body`.
- `stats-privacy.test.ts` — stats endpoints return aggregates only.
- `seam-boundaries.test.ts` — banned imports live only in their allowed
  files.

Any failure = block. A broken invariant is not a lint warning; it's a
silent security regression.

## Step 8 — Dependency advisory scan

Once `package.json` exists in `api/` and/or `frontend/`:

```sh
cd api && npm audit --audit-level=high
cd ../frontend && npm audit --audit-level=high
```

High or critical vulnerabilities block the cycle. `npm audit fix` only if
it doesn't introduce major version bumps — otherwise surface to the user
for a decision.

## Step 9 — Report

Post the result in chat, explicitly:

```
Security scan:
- Gitignore baseline: OK | FIXED | MISSING RULES <list>
- Tracked sensitive files: CLEAN | BLOCKED <list>
- Secret pattern scan: CLEAN | BLOCKED <file:line hits>
- Real-data scan: CLEAN | BLOCKED <file:line hits>
- Log hygiene: CLEAN | BLOCKED <file:line hits>
- Error-message interpolation: CLEAN | BLOCKED <file:line hits>
- Snapshots/fixtures: CLEAN | BLOCKED <file:line hits>
- LexiQuest invariant meta-tests: CLEAN | BLOCKED <list>
- npm audit (if applicable): CLEAN | <N high> <N critical>
Result: PASS | BLOCK
```

**Only on PASS** may the cycle continue to UPDATE DOCS. On BLOCK, fix the
findings and re-run the full scan — partial re-runs are not permitted
because a fix in one place can unmask a leak in another.

## Step 10 — On a real hit: rotation protocol

If a real secret is found in tracked files or history, rotation is **not
optional** and **not deferrable**:

1. Stop the cycle. Tell the user, in chat, exactly what was found and where.
2. Rotate the credential at the source:
   - **Anthropic API key** → console.anthropic.com → regenerate → update
     Azure SWA application settings → confirm a request succeeds.
   - **Azure Storage connection string** → portal → rotate account key →
     update SWA settings.
   - **`SESSION_SECRET`** → generate new 32-byte random value → update
     SWA settings (this logs every user out, which is the desired effect).
   - **Password hash** of a family member → admin reset via the running
     app, or seed script if app not yet live.
3. Remove the secret from the working tree AND from history if ever pushed.
4. Add a regression test or pattern to prevent recurrence — extend this
   skill's pattern list so the same shape blocks next time.
5. Log the incident in
   [../../../docs/changelog.md](../../../docs/changelog.md) under today's
   date with a terse note — enough to remember, not enough to re-leak.

---

**Never "note and continue".** A found secret is a full stop. The cost of
pausing is a minute; the cost of an un-rotated leaked API key is a hostile
token bill and a compromised family dataset.
