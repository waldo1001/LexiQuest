import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdfBase64, PdfSplitError, PAGES_PER_BATCH } from "./pdf-chunk.js";

/**
 * Build an N-page PDF as base64. Page i is given width `100 + i` so page
 * identity/order can be verified after splitting (pdf-lib has no text
 * extraction, but page sizes survive a copy).
 */
async function makePdfBase64(pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([100 + i, 200]);
  }
  return doc.saveAsBase64();
}

async function pageCountOf(base64) {
  const doc = await PDFDocument.load(base64);
  return doc.getPageCount();
}

describe("splitPdfBase64", () => {
  it("returns the original base64 unchanged when the PDF fits in one batch", async () => {
    const b64 = await makePdfBase64(PAGES_PER_BATCH);
    const batches = await splitPdfBase64(b64);
    expect(batches).toEqual([b64]);
  });

  it("splits a 20-page PDF into batches of 8 → page counts [8, 8, 4]", async () => {
    const b64 = await makePdfBase64(20);
    const batches = await splitPdfBase64(b64, { pagesPerBatch: 8 });
    expect(batches).toHaveLength(3);
    expect(await Promise.all(batches.map(pageCountOf))).toEqual([8, 8, 4]);
  });

  it("splits a 16-page PDF into two 8-page batches", async () => {
    const b64 = await makePdfBase64(16);
    const batches = await splitPdfBase64(b64, { pagesPerBatch: 8 });
    expect(await Promise.all(batches.map(pageCountOf))).toEqual([8, 8]);
  });

  it("each batch re-loads as a valid PDF and pages stay in order across batches", async () => {
    const total = 10;
    const b64 = await makePdfBase64(total);
    const batches = await splitPdfBase64(b64, { pagesPerBatch: 4 });

    const widths = [];
    for (const batch of batches) {
      const doc = await PDFDocument.load(batch);
      for (let i = 0; i < doc.getPageCount(); i++) {
        widths.push(Math.round(doc.getPage(i).getSize().width));
      }
    }
    expect(widths).toEqual(Array.from({ length: total }, (_, i) => 100 + i));
  });

  it("throws PdfSplitError when the input is not a valid PDF", async () => {
    // base64 of "not a pdf"
    await expect(splitPdfBase64("bm90IGEgcGRm")).rejects.toBeInstanceOf(PdfSplitError);
  });
});
