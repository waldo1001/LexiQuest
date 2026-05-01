import JSZip from "jszip";

export interface Slide {
  index: number;
  text: string;
  notes: string;
}

export class PptxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PptxParseError";
  }
}

const SLIDE_PATH_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_PATH_RE = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;
const TEXT_RUN_RE = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTextRuns(xml: string): string {
  const runs: string[] = [];
  let match: RegExpExecArray | null;
  TEXT_RUN_RE.lastIndex = 0;
  while ((match = TEXT_RUN_RE.exec(xml)) !== null) {
    const run = match[1].trim();
    if (run.length > 0) runs.push(decodeXmlEntities(run));
  }
  return runs.join(" ");
}

export async function extractSlidesFromPptx(buffer: Buffer): Promise<Slide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PptxParseError("Not a valid .pptx file (zip read failed)");
  }

  const slideXmlByIndex = new Map<number, string>();
  const notesXmlByIndex = new Map<number, string>();

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const slideMatch = path.match(SLIDE_PATH_RE);
    if (slideMatch) {
      slideXmlByIndex.set(Number(slideMatch[1]), await file.async("string"));
      continue;
    }
    const notesMatch = path.match(NOTES_PATH_RE);
    if (notesMatch) {
      notesXmlByIndex.set(Number(notesMatch[1]), await file.async("string"));
    }
  }

  if (slideXmlByIndex.size === 0) {
    throw new PptxParseError("No slides found in .pptx");
  }

  const indices = [...slideXmlByIndex.keys()].sort((a, b) => a - b);
  return indices.map((index) => {
    const slideXml = slideXmlByIndex.get(index)!;
    const notesXml = notesXmlByIndex.get(index);
    return {
      index,
      text: extractTextRuns(slideXml),
      notes: notesXml ? extractTextRuns(notesXml) : "",
    };
  });
}
