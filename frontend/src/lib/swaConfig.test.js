import { describe, it, expect } from "vitest";
import { readSwaConfig } from "./swaConfig.js";

describe("readSwaConfig", () => {
  it("exposes SPA fallback rewriting to index.html", () => {
    const cfg = readSwaConfig();
    expect(cfg.navigationFallback?.rewrite).toBe("/index.html");
  });

  it("leaves /api/* requests to the Functions runtime", () => {
    const cfg = readSwaConfig();
    const apiRoute = (cfg.routes ?? []).find((r) => r.route === "/api/*");
    expect(apiRoute).toBeDefined();
    expect(apiRoute.rewrite).toBeUndefined();
  });
});
