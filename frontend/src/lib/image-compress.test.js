import { describe, it, expect, vi } from "vitest";
import {
  compressImageIfNeeded,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_DIMENSION,
} from "./image-compress.js";

/**
 * Build a fake File of `bytes` length. The File spec lets us pass any
 * blob parts; we use a single typed-array of the desired size so
 * `.size` reflects what we asked for. The bytes themselves are zeros —
 * what matters for these tests is the size and mimeType.
 */
function fakeFile({ bytes, type = "image/jpeg", name = "photo.jpg" }) {
  return new File([new Uint8Array(bytes)], name, { type });
}

/**
 * Build a fake `createImageBitmap` that returns a bitmap stub with the
 * given dimensions. The stub records its `.close()` call.
 */
function makeBitmapFactory({ width, height }) {
  const bitmap = { width, height, close: vi.fn() };
  const fn = vi.fn().mockResolvedValue(bitmap);
  return { fn, bitmap };
}

/**
 * Build a fake canvas factory whose `.toBlob(cb, type, quality)`
 * resolves with the next blob from `blobs` queue. Records every
 * (type, quality) pair into `calls`.
 */
function makeCanvasFactory(blobs) {
  const calls = [];
  const drawCalls = [];
  const factory = () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (...args) => drawCalls.push(args),
    }),
    toBlob: (cb, type, quality) => {
      calls.push({ type, quality });
      const next = blobs.shift();
      // Use queueMicrotask to mimic async toBlob behaviour
      queueMicrotask(() => cb(next ?? null));
    },
  });
  return { factory, calls, drawCalls };
}

describe("compressImageIfNeeded", () => {
  it("passes a small file through unchanged", async () => {
    const file = fakeFile({ bytes: 100_000, type: "image/jpeg" }); // 100 KB
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 800, height: 600 });
    const { factory: canvasFactory } = makeCanvasFactory([]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(false);
    expect(result.file).toBe(file);
    expect(result.originalSize).toBe(100_000);
    expect(result.finalSize).toBe(100_000);
    expect(createImageBitmapImpl).not.toHaveBeenCalled();
  });

  it("passes a non-image type (PDF) through unchanged even when over threshold", async () => {
    const file = fakeFile({
      bytes: DEFAULT_MAX_BYTES + 1,
      type: "application/pdf",
      name: "doc.pdf",
    });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 100, height: 100 });
    const { factory: canvasFactory } = makeCanvasFactory([]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(false);
    expect(result.file).toBe(file);
    expect(createImageBitmapImpl).not.toHaveBeenCalled();
  });

  it("downscales an oversized landscape JPEG to longest-side 2000 px", async () => {
    const file = fakeFile({ bytes: 6 * 1024 * 1024, type: "image/jpeg" });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 4000, height: 3000 });
    const compressedBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], {
      type: "image/jpeg",
    });
    const { factory: canvasFactory, drawCalls } = makeCanvasFactory([compressedBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.size).toBe(2 * 1024 * 1024);
    expect(result.originalSize).toBe(6 * 1024 * 1024);
    expect(result.finalSize).toBe(2 * 1024 * 1024);
    // drawImage was called with bitmap, target dims (sx,sy,sw,sh OR dx,dy,dw,dh)
    expect(drawCalls.length).toBe(1);
    const drawArgs = drawCalls[0];
    // Last two args are dest width/height
    const dw = drawArgs[drawArgs.length - 2];
    const dh = drawArgs[drawArgs.length - 1];
    expect(dw).toBe(DEFAULT_MAX_DIMENSION);
    expect(dh).toBe(1500);
  });

  it("preserves portrait aspect ratio when downscaling", async () => {
    const file = fakeFile({ bytes: 6 * 1024 * 1024, type: "image/jpeg" });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 3000, height: 4000 });
    const compressedBlob = new Blob([new Uint8Array(1_500_000)], { type: "image/jpeg" });
    const { factory: canvasFactory, drawCalls } = makeCanvasFactory([compressedBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    const drawArgs = drawCalls[0];
    const dw = drawArgs[drawArgs.length - 2];
    const dh = drawArgs[drawArgs.length - 1];
    expect(dw).toBe(1500);
    expect(dh).toBe(DEFAULT_MAX_DIMENSION);
  });

  it("re-encodes without resizing when dimensions are already small but bytes are large", async () => {
    const file = fakeFile({ bytes: 4 * 1024 * 1024, type: "image/jpeg" });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 1500, height: 1000 });
    const compressedBlob = new Blob([new Uint8Array(2_000_000)], { type: "image/jpeg" });
    const { factory: canvasFactory, drawCalls } = makeCanvasFactory([compressedBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    const drawArgs = drawCalls[0];
    const dw = drawArgs[drawArgs.length - 2];
    const dh = drawArgs[drawArgs.length - 1];
    expect(dw).toBe(1500);
    expect(dh).toBe(1000);
  });

  it("retries at lower quality when the first pass is still over the target", async () => {
    const file = fakeFile({ bytes: 10 * 1024 * 1024, type: "image/jpeg" });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 4000, height: 3000 });
    const firstBlob = new Blob([new Uint8Array(4 * 1024 * 1024)], { type: "image/jpeg" });
    const secondBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: "image/jpeg" });
    const { factory: canvasFactory, calls } = makeCanvasFactory([firstBlob, secondBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    expect(result.file.size).toBe(2 * 1024 * 1024);
    expect(calls.length).toBe(2);
    expect(calls[0].quality).toBeGreaterThan(calls[1].quality);
  });

  it("converts a PNG input to image/jpeg output", async () => {
    const file = fakeFile({
      bytes: 5 * 1024 * 1024,
      type: "image/png",
      name: "shot.png",
    });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 1800, height: 1200 });
    const compressedBlob = new Blob([new Uint8Array(1_500_000)], { type: "image/jpeg" });
    const { factory: canvasFactory, calls } = makeCanvasFactory([compressedBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe("image/jpeg");
    expect(calls[0].type).toBe("image/jpeg");
    expect(result.file.name).toBe("shot.jpg");
  });

  it("throws image_compress_failed when createImageBitmap rejects", async () => {
    const file = fakeFile({ bytes: 6 * 1024 * 1024, type: "image/jpeg" });
    const createImageBitmapImpl = vi.fn().mockRejectedValue(new Error("decode oops"));
    const { factory: canvasFactory } = makeCanvasFactory([]);

    await expect(
      compressImageIfNeeded(file, { createImageBitmapImpl, canvasFactory }),
    ).rejects.toThrow("image_compress_failed");
  });

  it("throws image_compress_failed when toBlob yields null on every attempt", async () => {
    const file = fakeFile({ bytes: 6 * 1024 * 1024, type: "image/jpeg" });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 4000, height: 3000 });
    const { factory: canvasFactory } = makeCanvasFactory([null, null]);

    await expect(
      compressImageIfNeeded(file, { createImageBitmapImpl, canvasFactory }),
    ).rejects.toThrow("image_compress_failed");
  });

  it("preserves a name without an extension when constructing the compressed file", async () => {
    const file = fakeFile({
      bytes: 5 * 1024 * 1024,
      type: "image/jpeg",
      name: "photo-from-camera",
    });
    const { fn: createImageBitmapImpl } = makeBitmapFactory({ width: 1800, height: 1200 });
    const compressedBlob = new Blob([new Uint8Array(1_500_000)], { type: "image/jpeg" });
    const { factory: canvasFactory } = makeCanvasFactory([compressedBlob]);

    const result = await compressImageIfNeeded(file, {
      createImageBitmapImpl,
      canvasFactory,
    });

    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe("photo-from-camera.jpg");
  });
});
