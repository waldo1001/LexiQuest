# Plan — card import on the newest Claude Sonnet and Haiku (#7)

Spec: [docs/specs/7-latest-claude-models.md](../../specs/7-latest-claude-models.md)
Status: approved by the owner ("just build it here", 2026-10-19) — manual build on `build/latest-claude-models`.

## Task

Move the extraction pins to `claude-sonnet-5-5` / `claude-haiku-5-5` with the request and response
changes those models need, map refusals and cut-off replies to typed, logged 422s, and add a weekly
"Model watch" check that opens an issue when a newer Sonnet or Haiku exists.

## Scope

IN: `api/src/shared/claude.ts` (+ test), `api/src/functions/cards-import.ts` (+ test),
`api/src/shared/model-catalog.ts` (+ test), `api/scripts/check-latest-models.ts`,
`.github/workflows/model-watch.yml`, `Design.md`, `docs/setup.md`, changelog, PROGRESS, spec §12.
OUT: runtime model switching, Opus/Fable, prompt rewrites, an extraction eval, SDK upgrade
(0.135.0 already types `output_config.effort`, beta `fallbacks`, `models.list()`).

## Files

See spec §10.

## Seams

`claude` (interface unchanged; `FakeClaudeClient.nextError` for the typed errors), `logger` (fake).
The new pure helpers (`buildMessageParams`, `textFromMessage`, `model-catalog.ts`) need no seam.

## RED list

Spec §5: AC1 pins; AC2 request params (effort low, max_tokens 16000/4000, Sonnet-only fallback,
no thinking/sampling/prefill); AC3 response reading (text by type, typed refusal/truncation);
AC4 import handler 422 + logs + no persistence; AC5 drift logic. AC6 live probe and AC7 workflow
dispatch are operator steps.

## Open questions

Spec §9 Q1–Q3 taken at their defaults: pin + alert, separate repo secret `ANTHROPIC_MODELS_API_KEY`,
server-side fallback on Sonnet.

## Risks

Spec §9 R1–R6 (PDF latency with thinking on, quality drift, benign refusals, tokenizer, naming).

## Follow-ups

Spec §8 (extraction eval, Haiku for photos, rollback override, League-drafted bump specs, caching).

## Blast radius

Rating: breaking
Adds `api/scripts/check-latest-models.ts` (an `api/scripts/**` path) and touches `claude.ts`,
`.github/` and `Design.md`; no route, row-key, cookie or dependency change.
