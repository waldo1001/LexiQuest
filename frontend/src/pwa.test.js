import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MANIFEST_PATH = resolve(__dirname, "../public/manifest.json");

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
});
