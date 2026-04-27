// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_DIR = resolve(__dirname, "../..");
const DIST_DIR = resolve(FRONTEND_DIR, "dist");

// Slow integration: runs the real Vite build once for the suite.
beforeAll(() => {
  execSync("npm run build", { cwd: FRONTEND_DIR, stdio: "inherit" });
}, 120_000);

function findFirstExisting(candidates) {
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function isPng(path) {
  const buf = readFileSync(path);
  return (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

describe("PWA build artifacts", () => {
  it("PWA-B1: dist/ contains a manifest with name LexiQuest", () => {
    const manifestPath = findFirstExisting([
      resolve(DIST_DIR, "manifest.json"),
      resolve(DIST_DIR, "manifest.webmanifest"),
    ]);
    expect(manifestPath, "no manifest in dist/").not.toBeNull();
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("LexiQuest");
  });

  it("PWA-B2: dist/ contains a non-empty service worker", () => {
    const swPath = findFirstExisting([
      resolve(DIST_DIR, "sw.js"),
      resolve(DIST_DIR, "registerSW.js"),
    ]);
    expect(swPath, "no service worker in dist/").not.toBeNull();
    expect(statSync(swPath).size).toBeGreaterThan(0);
  });

  it("PWA-B3: dist/icons/ contains valid 192 and 512 PNGs", () => {
    const i192 = resolve(DIST_DIR, "icons/icon-192.png");
    const i512 = resolve(DIST_DIR, "icons/icon-512.png");
    expect(existsSync(i192), "missing icon-192.png").toBe(true);
    expect(existsSync(i512), "missing icon-512.png").toBe(true);
    expect(isPng(i192), "icon-192.png is not a valid PNG").toBe(true);
    expect(isPng(i512), "icon-512.png is not a valid PNG").toBe(true);
  });
});
