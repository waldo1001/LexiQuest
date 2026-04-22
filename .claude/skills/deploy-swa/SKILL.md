---
name: deploy-swa
description: Trigger and monitor a LexiQuest deploy to Azure Static Web Apps. Runs after `/local-smoke` passes. Push-to-main auto-deploys via GitHub Actions; this skill watches that run, tails logs, and probes the live URL until green. Never pushes force. Never rotates secrets.
---

# /deploy-swa — LexiQuest deploy-and-verify runner

LexiQuest deploys via push-to-`main` → GitHub Actions → Azure Static Web
Apps. The skill does NOT own the deploy — GitHub Actions does. What this
skill does:

1. Confirm `/local-smoke` has passed on the current HEAD.
2. Push `main` (if not already pushed).
3. Watch the GitHub Actions run on the resulting commit.
4. Probe the live URL once the run is green.
5. Report.

## When to run

- After a `/tdd-cycle` + `/docs-update` + `/local-smoke` all pass and the
  user says "deploy" / "ship" / "push".
- When the user asks to "check the deploy" or "see if the last push
  shipped".

## Safety invariants

- NEVER `git push --force`. If a remote is ahead, stop and ask the user.
- NEVER rotate secrets or edit Azure SWA app settings from this skill.
  Secrets changes are a separate, user-triggered action.
- NEVER re-run failed workflow runs without user confirmation — a failing
  deploy is usually a config or secret issue that needs human eyes.

## Step 0 — Preflight

Confirm all of the following before pushing:

```sh
cd /Users/waldo/SourceCode/Community/LexiQuest
git status       # clean working tree expected
git branch       # must be on main
```

If not on main, stop. Feature branches get a PR; `/deploy-swa` is for
main-branch ships only.

Confirm the most recent `/local-smoke` run was against the commit that's
about to ship — ask the user if uncertain.

## Step 1 — Push

```sh
git push origin main
```

Capture the commit SHA that was just pushed:

```sh
DEPLOY_SHA="$(git rev-parse HEAD)"
```

## Step 2 — Find the GitHub Actions run

Use `gh` to locate the workflow run triggered by this commit:

```sh
gh run list --commit "$DEPLOY_SHA" --limit 1 --json databaseId,status,conclusion,workflowName,url
```

Expect one row for the SWA deploy workflow. If none appears within ~30s,
the workflow either didn't trigger (check
[.github/workflows/](../../../.github/workflows/) exists and is valid) or
the push never reached GitHub.

Save the run ID:

```sh
RUN_ID="$(gh run list --commit "$DEPLOY_SHA" --limit 1 --json databaseId -q '.[0].databaseId')"
```

## Step 3 — Watch the run

```sh
gh run watch "$RUN_ID" --exit-status
```

`gh run watch` blocks and tails status until the run completes. `--exit-status` makes it exit non-zero if the run fails — the skill must then stop and report the failure, not swallow it.

If the run fails:

1. Fetch logs for the failing job:
   ```sh
   gh run view "$RUN_ID" --log-failed
   ```
2. Post the tail of the failing step in chat (no secrets — redact any
   environment-variable values echoed).
3. Stop. Do NOT auto-retry. The user decides next step.

## Step 4 — Probe the live URL

Once the run is green, hit the live SWA URL. The URL should be stored in
[docs/setup.md](../../../docs/setup.md) after Phase 1; pull it from
there or from Azure (`az staticwebapp show`) — do not hardcode.

```sh
LIVE_URL="<from docs/setup.md>"
curl -sS "$LIVE_URL/api/hello" | tee /tmp/lexiquest-deploy-probe.json
```

Phase-appropriate probes:

- **Phase 1**: `/api/hello` returns `{ "msg": "Hello from LexiQuest" }`.
- **Phase 3+**: `/api/users/public` returns 4 objects with no hashes.
- **Phase 10+**: logging in as Lex and hitting `/api/me` round-trips.

The probe is deliberately shallow — end-to-end behavior is covered by
`/local-smoke` against Azurite. Live probes are "did the bundle land and
can Azure reach storage".

## Step 5 — Report

Post one short summary in chat:

```
/deploy-swa PASS
- Commit: <short-sha> — <commit-subject>
- GH Actions run: <url>
- Deploy duration: <Xm Ys>
- Live probe (<Nth phase endpoint>): <200 OK, shape as expected>
- Live URL: <url>
```

On failure, report:

```
/deploy-swa FAIL
- Commit: <short-sha>
- GH Actions run: <url>
- Failed job: <job-name>
- Failing step: <step-name>
- Log tail (secrets redacted):
    <last ~30 lines>
- Next step: <check env vars | check SWA app settings | fix code | ...>
```

## Step 6 — Update the changelog

On success, add a one-liner to
[docs/changelog.md](../../../docs/changelog.md):

```
- Deployed <short-sha> to SWA (<phase milestone if applicable>).
```

On failure, log the attempt too:

```
- Attempted deploy <short-sha> — failed at <step-name>. Rolled back / held. See <GH run URL>.
```

---

**A deploy is not done when the push is done. It is done when the live URL
serves the expected response.** The probe in Step 4 is the gate.
