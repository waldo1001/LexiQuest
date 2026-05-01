/**
 * Client-side image compression for the photo-import flow.
 *
 * The backend rejects image base64 payloads above 5 MB (see
 * `MAX_IMAGE_PAYLOAD_BYTES` in `api/src/functions/cards-import.ts`).
 * Modern phone cameras routinely produce 5–15 MB JPEGs, so we
 * downscale + recompress in the browser before encoding to base64.
 *
 * Behaviour:
 *  - Files at or below `DEFAULT_MAX_BYTES` are returned as-is.
 *  - Non-image MIME types (PDF, PPTX) are returned as-is — those have
 *    their own 32 MB limits and can't be losslessly recompressed here.
 *  - Oversized images are decoded, scaled so the longest side ≤ 2000 px
 *    (preserving aspect ratio), and re-encoded as JPEG at q=0.85.
 *  - If the first pass is still over the target, a single retry at
 *    q=0.7 is attempted before giving up.
 *  - Animated GIFs lose animation; PNGs lose transparency. Acceptable
 *    for vocabulary photos.
 *
 * Seams:
 *  - `createImageBitmapImpl` defaults to `globalThis.createImageBitmap`.
 *  - `canvasFactory` defaults to `() => document.createElement("canvas")`.
 *  Tests inject stubs via these options.
 */

export const DEFAULT_MAX_BYTES = 3.5 * 1024 * 1024;
export const DEFAULT_MAX_DIMENSION = 2000;
export const DEFAULT_QUALITY = 0.85;
export const FALLBACK_QUALITY = 0.7;
export const SUPPORTED_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * @typedef {Object} CompressResult
 * @property {File} file
 * @property {boolean} compressed
 * @property {number} originalSize
 * @property {number} finalSize
 */

/**
 * @param {File} file
 * @param {{
 *   maxBytes?: number,
 *   maxDimension?: number,
 *   quality?: number,
 *   fallbackQuality?: number,
 *   createImageBitmapImpl?: (file: File) => Promise<{width:number,height:number,close?:()=>void}>,
 *   canvasFactory?: () => HTMLCanvasElement,
 * }} [opts]
 * @returns {Promise<CompressResult>}
 */
export async function compressImageIfNeeded(file, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const fallbackQuality = opts.fallbackQuality ?? FALLBACK_QUALITY;
  const createImageBitmapImpl =
    opts.createImageBitmapImpl ?? globalThis.createImageBitmap;
  const canvasFactory =
    /* v8 ignore next */
    opts.canvasFactory ?? (() => document.createElement("canvas"));

  const originalSize = file.size;

  if (file.size <= maxBytes || !SUPPORTED_TYPES.includes(file.type)) {
    return { file, compressed: false, originalSize, finalSize: originalSize };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmapImpl(file);
  } catch {
    throw new Error("image_compress_failed");
  }

  try {
    const { width: srcW, height: srcH } = bitmap;
    const longest = Math.max(srcW, srcH);
    const scale = longest > maxDimension ? maxDimension / longest : 1;
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    const canvas = canvasFactory();
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);

    let blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size > maxBytes) {
      blob = await canvasToBlob(canvas, "image/jpeg", fallbackQuality);
    }
    if (!blob) {
      throw new Error("image_compress_failed");
    }

    const baseName = stripExtension(file.name) || "photo";
    const compressedFile = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
    });

    return {
      file: compressedFile,
      compressed: true,
      originalSize,
      finalSize: compressedFile.size,
    };
  } finally {
    bitmap.close?.();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function stripExtension(name) {
  /* v8 ignore next */
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
