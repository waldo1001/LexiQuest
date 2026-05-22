/**
 * Client-side PDF page chunking.
 *
 * Azure Static Web Apps managed functions cap every API request at 45 s. A
 * multi-page PDF sent to Claude in one `/api/cards/import` request can take
 * far longer (a 35-page deck measured ~62 s), so the gateway kills it and the
 * UI shows a generic error. Splitting the PDF into page-range batches in the
 * browser lets each batch be its own sub-45 s request; the screen merges the
 * returned candidates before Import Review. See
 * docs/plans/post-v1-pdf-chunked-import.md.
 */

// Pages per import request. 62 s / 35 pages ≈ 1.8 s/page, so 8 pages ≈
// ~15–20 s/request — comfortable headroom under the SWA 45 s cap.
export const PAGES_PER_BATCH = 8;

export class PdfSplitError extends Error {
  constructor(message) {
    super(message);
    this.name = "PdfSplitError";
  }
}

/**
 * Split a base64-encoded PDF into an ordered array of base64 PDFs, each holding
 * at most `pagesPerBatch` pages. A PDF that already fits in one batch is returned
 * as `[base64]` unchanged (no re-encode). `pdf-lib` is loaded lazily so it stays
 * out of the initial bundle until a PDF is actually imported.
 *
 * @param {string} base64 - base64-encoded PDF (no data-URI prefix)
 * @param {{ pagesPerBatch?: number }} [opts]
 * @returns {Promise<string[]>} ordered base64 PDFs, first batch = first pages
 * @throws {PdfSplitError} when the input cannot be parsed as a PDF
 */
export async function splitPdfBase64(base64, { pagesPerBatch = PAGES_PER_BATCH } = {}) {
  const { PDFDocument } = await import("pdf-lib");

  let source;
  try {
    source = await PDFDocument.load(base64);
  } catch (err) {
    throw new PdfSplitError(`Could not read PDF: ${err?.message ?? "invalid PDF"}`);
  }

  const total = source.getPageCount();
  if (total <= pagesPerBatch) return [base64];

  const batches = [];
  for (let start = 0; start < total; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch, total);
    const indices = [];
    for (let i = start; i < end; i++) indices.push(i);

    const batch = await PDFDocument.create();
    const pages = await batch.copyPages(source, indices);
    for (const page of pages) batch.addPage(page);
    batches.push(await batch.saveAsBase64());
  }
  return batches;
}
