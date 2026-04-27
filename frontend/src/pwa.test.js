import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, "../public");
const MANIFEST_PATH = resolve(PUBLIC_DIR, "manifest.json");
const INDEX_HTML_PATH = resolve(__dirname, "../index.html");
const SWA_CONFIG_PATH = resolve(__dirname, "../../staticwebapp.config.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
} catch {
  manifest = null;
}

describe("PWA manifest.json", () => {
  it("PWA-1: manifest.json exists and is valid JSON", () => {
    expect(manifest).not.toBeNull();
  });

  it("PWA-2: has name LexiQuest", () => {
    expect(manifest?.name).toBe("LexiQuest");
  });

  it("PWA-3: has short_name", () => {
    expect(manifest?.short_name).toBeTruthy();
  });

  it("PWA-4: has start_url", () => {
    expect(manifest?.start_url).toBeTruthy();
  });

  it("PWA-5: has display standalone", () => {
    expect(manifest?.display).toBe("standalone");
  });

  it("PWA-6: has theme_color", () => {
    expect(manifest?.theme_color).toBeTruthy();
  });

  it("PWA-7: has icons with at least 192px size", () => {
    const sizes = (manifest?.icons ?? []).map((i) => i.sizes);
    expect(sizes.some((s) => s.includes("192"))).toBe(true);
  });

  it("PWA-8: has icons with at least 512px size", () => {
    const sizes = (manifest?.icons ?? []).map((i) => i.sizes);
    expect(sizes.some((s) => s.includes("512"))).toBe(true);
  });

  it("PWA-9: every icons[].src resolves to a real file under public/", () => {
    const icons = manifest?.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const path = resolve(PUBLIC_DIR, icon.src.replace(/^\//, ""));
      expect(existsSync(path), `missing icon file: ${icon.src}`).toBe(true);
    }
  });

  it("PWA-10: has separate any and maskable icon entries (not the conflated 'any maskable')", () => {
    const purposes = (manifest?.icons ?? []).map((i) => i.purpose ?? "any");
    const hasAnyOnly = purposes.some(
      (p) => p === "any" || p.split(/\s+/).every((w) => w === "any"),
    );
    const hasMaskableOnly = purposes.some(
      (p) => p === "maskable" || p.split(/\s+/).every((w) => w === "maskable"),
    );
    expect(hasAnyOnly).toBe(true);
    expect(hasMaskableOnly).toBe(true);
  });

  it("PWA-11: index.html has an apple-touch-icon link to a real file", () => {
    const html = readFileSync(INDEX_HTML_PATH, "utf-8");
    const match = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/i);
    expect(match, "no apple-touch-icon link in index.html").not.toBeNull();
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/i);
    expect(hrefMatch).not.toBeNull();
    const href = hrefMatch[1];
    const path = resolve(PUBLIC_DIR, href.replace(/^\//, ""));
    expect(existsSync(path), `apple-touch-icon target missing: ${href}`).toBe(
      true,
    );
  });

  it("PWA-12: staticwebapp.config.json excludes manifest and icons from SPA fallback", () => {
    const cfg = JSON.parse(readFileSync(SWA_CONFIG_PATH, "utf-8"));
    const exclude = cfg?.navigationFallback?.exclude ?? [];
    const joined = exclude.join("|");
    expect(joined, "missing /manifest.json exclusion").toMatch(/manifest\.json/);
    expect(joined, "missing /icons exclusion").toMatch(/\/icons/);
  });
});
