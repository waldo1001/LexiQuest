import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractSlidesFromPptx, PptxParseError } from "./pptx-extractor.js";

/**
 * Build a minimal in-memory .pptx zip containing the given slides.
 * Each entry produces ppt/slides/slideN.xml and (if notes provided)
 * ppt/notesSlides/notesSlideN.xml. Text runs are wrapped in <a:t>.
 */
async function buildPptxBuffer(
  entries: Array<{
    index: number;
    /** Raw XML text-run contents (already-encoded) for the slide body. */
    slideRuns?: string[];
    /** Raw XML text-run contents for the notes; omit for no-notes file. */
    notesRuns?: string[];
  }>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    const slideRuns = entry.slideRuns ?? [];
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${slideRuns
      .map((r) => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`)
      .join("")}</p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${entry.index}.xml`, slideXml);

    if (entry.notesRuns) {
      const notesXml = `<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${entry.notesRuns
        .map((r) => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`)
        .join("")}</p:spTree></p:cSld></p:notes>`;
      zip.file(`ppt/notesSlides/notesSlide${entry.index}.xml`, notesXml);
    }
  }
  return await zip.generateAsync({ type: "nodebuffer" });
}

describe("extractSlidesFromPptx", () => {
  it("returns slides with text and notes for a happy-path deck", async () => {
    const buf = await buildPptxBuffer([
      { index: 1, slideRuns: ["Bonjour"], notesRuns: ["French for hello"] },
      { index: 2, slideRuns: ["Au revoir"], notesRuns: ["French for goodbye"] },
    ]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides).toEqual([
      { index: 1, text: "Bonjour", notes: "French for hello" },
      { index: 2, text: "Au revoir", notes: "French for goodbye" },
    ]);
  });

  it("returns empty notes string when a slide has no notesSlide file", async () => {
    const buf = await buildPptxBuffer([{ index: 1, slideRuns: ["Hola"] }]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides).toEqual([{ index: 1, text: "Hola", notes: "" }]);
  });

  it("returns empty text for image-only slides (no <a:t> runs)", async () => {
    const buf = await buildPptxBuffer([
      { index: 1, slideRuns: ["Has text"] },
      { index: 2, slideRuns: [], notesRuns: ["only notes"] },
    ]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides[1]).toEqual({ index: 2, text: "", notes: "only notes" });
  });

  it("decodes XML entities in both text and notes", async () => {
    const buf = await buildPptxBuffer([
      {
        index: 1,
        slideRuns: ["A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;"],
        notesRuns: ["x &amp; y"],
      },
    ]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides[0].text).toBe("A & B < C > D \"E\" 'F'");
    expect(slides[0].notes).toBe("x & y");
  });

  it("joins multiple text runs within a slide with spaces", async () => {
    const buf = await buildPptxBuffer([
      { index: 1, slideRuns: ["Hello", "world", "again"] },
    ]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides[0].text).toBe("Hello world again");
  });

  it("orders slides numerically by index regardless of zip entry order", async () => {
    const buf = await buildPptxBuffer([
      { index: 10, slideRuns: ["ten"] },
      { index: 2, slideRuns: ["two"] },
      { index: 1, slideRuns: ["one"] },
    ]);

    const slides = await extractSlidesFromPptx(buf);

    expect(slides.map((s) => s.index)).toEqual([1, 2, 10]);
    expect(slides.map((s) => s.text)).toEqual(["one", "two", "ten"]);
  });

  it("throws PptxParseError on a malformed (non-zip) buffer", async () => {
    const garbage = Buffer.from("this is definitely not a zip file");

    await expect(extractSlidesFromPptx(garbage)).rejects.toBeInstanceOf(
      PptxParseError,
    );
  });

  it("throws PptxParseError on a zip with zero slide files", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractSlidesFromPptx(buf)).rejects.toBeInstanceOf(
      PptxParseError,
    );
  });
});
