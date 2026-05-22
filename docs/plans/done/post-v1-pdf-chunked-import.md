# Post-v1 — Reliable PDF import under the SWA 45s cap

## Revision history

- **R1 (approved):** client-side page chunking only. **Invalidated by smoke test** —
  Claude's extraction latency is output-bound, not page-bound: at 8 pages/batch a
  batch took 62.6s; even at 4 pages a batch hit 46.1s. No page-batch size reliably
  stays under the SWA 45s cap on Sonnet.
- **R2 (this plan, user-chosen direction):** stay on managed functions; combine
  client chunking + the **faster Haiku model** for PDF extraction + (optional)
  adaptive re-split-and-retry. **Smoke-validated:** Haiku at 4 pages/batch on the
  real file ran every batch in **6.4–12.2s** (slowest 12.2s, no truncation) — a
  ~3.7× margin under the 45s cap.

## Task

Make PDF card-import reliable under Azure SWA's hard 45s per-request cap by
extracting PDFs with the fast Haiku model and splitting PDFs into small
page-range batches client-side (each its own sub-45s request), merging the
candidates into Import Review.

## Scope boundary

**IN**

- **Backend (Slice 1):** `extractCards` accepts an optional `model`;
  `createClaudeClient` uses `input.model ?? SONNET_MODEL`. `cards-import.ts`
  passes `HAIKU_MODEL` when `mimeType === "application/pdf"`. Model ids exported
  as constants from `claude.ts`.
- **Frontend (Slice 2 — chunking, already built & green):** PDFs split into
  `PAGES_PER_BATCH = 4` (smoke-validated) page batches via `pdf-chunk.js`, sent
  sequentially through `importCards`, candidates merged in order, progress notice
  between batches, clear `import.error.pdfRead` when the PDF can't be parsed.
- **Frontend (Slice 3 — optional adaptive retry):** if a batch import fails with
  a non-terminal error (i.e. not parse/claude/tooLarge) and the batch has >1
  page, re-split that batch in half (reusing `splitPdfBase64` on the batch) and
  retry the halves; bottom out at 1 page, then surface the mapped error. Backstop
  for a pathologically dense page that still exceeds 45s even on Haiku.

**OUT**

- Images and `.pptx` stay on the Sonnet model and single-request (note: a dense
  single image has the same latency risk in theory — deferred follow-up).
- Parallel / bounded-concurrency batch dispatch (sequential this time).
- Bring-your-own Azure Functions (the permanent infra fix — deferred; recorded as
  the alternative if managed+Haiku proves insufficient in the field).

## Files to create / touch

- `api/src/shared/claude.ts` — `model?` on `ExtractCardsInput`; export
  `SONNET_MODEL` + `HAIKU_MODEL`; `extractCards` uses `input.model ?? SONNET_MODEL`.
- `api/src/functions/cards-import.ts` — pass `HAIKU_MODEL` for the PDF path.
- `api/src/functions/cards-import.test.ts` — model-selection tests.
- `api/testing/fake-claude-client.ts` — already records `extractCardsInputs`
  (no change expected; verify `model` flows through).
- `frontend/src/lib/pdf-chunk.js` (+ test) — **done, green**.
- `frontend/src/screens/PhotoImport.jsx` (+ test) — chunking **done, green**;
  adaptive retry added in Slice 3.
- `frontend/src/i18n/strings.js` — `import.progress`, `import.error.pdfRead`
  **done**.
- `frontend/package.json` — `pdf-lib` **done**.

## Seams involved

`claude` (model selection through the ClaudeClient seam — testable via
`FakeClaudeClient.extractCardsInputs`), `fetch` (frontend, via injected
`importCards`). No tables/clock/hasher/signer/random/logger/tts changes.

## RED test list (remaining — Slice 1 backend; Slice 2 frontend already green)

- **B1:** a PDF import calls `claude.extractCards` with `model === HAIKU_MODEL`.
  - `api/src/functions/cards-import.test.ts`: `"PDF import requests the fast (Haiku) model"`
  - seam: claude · edge: mimeType branch
- **B2:** an image import calls `extractCards` without overriding the model
  (default Sonnet path unchanged).
  - `cards-import.test.ts`: `"image import leaves the default extraction model"`
  - seam: claude · edge: non-PDF branch
- **B3:** `extractCards` request uses `input.model` when provided, else
  `SONNET_MODEL` (guarded — note `createClaudeClient` is `/* v8 ignore */`, so
  this is asserted at the handler/seam boundary via B1/B2 rather than a direct
  SDK round-trip).
- **(Slice 3, if included) C1:** a batch that rejects with a non-terminal error
  is re-split and retried at smaller page size; candidates from the retried
  halves are merged.
  - `PhotoImport.test.jsx`: `"a timed-out PDF batch is re-split and retried"`
- **(Slice 3) C2:** a single-page batch that fails surfaces the mapped error (no
  infinite retry).
  - `PhotoImport.test.jsx`: `"a single-page batch failure surfaces the error"`

## Open questions / assumptions

1. **Haiku model id `claude-haiku-4-5-20251001`** — validated end-to-end against
   the real PDF (document blocks supported, no truncation).
2. **`PAGES_PER_BATCH = 4`** — validated (12.2s worst on the real file). Tunable.
3. **Quality:** Haiku extraction judged acceptable; Import Review still gates all
   persistence (invariant 3), so the user edits/deselects before saving. Images
   stay on Sonnet to avoid regressing the working path.
4. **Slice 3 (adaptive retry) is optional** given the 3.7× Haiku margin. Recommend
   shipping Slices 1–2 first; add Slice 3 only if field data shows real timeouts.

## Risks

- **Lower extraction quality on Haiku** (invariant: a wrong memorized card is
  worse than none). Mitigation: review-screen gate intact; user-pinned
  question/answer languages when courseLang is set; images keep Sonnet.
- **Pathologically dense single page** could still exceed 45s on Haiku →
  Slice 3 adaptive retry, or a mapped error otherwise.
- **Model drift:** if Anthropic renames/retires the Haiku id, import breaks →
  constant lives in one place (`claude.ts`) and is covered by B1.

## Out-of-scope follow-ups

- Bring-your-own Azure Functions to remove the 45s cap entirely (permanent fix).
- Same latency mitigation for dense single-image and large-pptx imports.
- Parallel batch dispatch to cut total wall-clock.
