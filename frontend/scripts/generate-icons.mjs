#!/usr/bin/env node
import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOURCE = resolve(__dirname, "icon-source/waldo.png");
const OUT_DIR = resolve(__dirname, "../public/icons");

if (!existsSync(SOURCE)) {
  console.error(`source icon missing: ${SOURCE}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

async function writeAny(size) {
  const out = resolve(OUT_DIR, `icon-${size}.png`);
  await sharp(SOURCE).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
  console.log(`wrote ${out}`);
}

async function writeMaskable(size) {
  const safe = Math.round(size * 0.8);
  const pad = Math.round((size - safe) / 2);
  const inner = await sharp(SOURCE).resize(safe, safe, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();
  const out = resolve(OUT_DIR, `icon-${size}-maskable.png`);
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: inner, top: pad, left: pad }])
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
}

await writeAny(192);
await writeAny(512);
await writeMaskable(192);
await writeMaskable(512);
