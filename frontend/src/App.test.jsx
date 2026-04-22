import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import App from "./App.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the UserPicker at /", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "u1", name: "Alice", avatar_emoji: "🦊", color: "#000" },
        ],
      }),
    );
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /who are you/i }),
    ).toBeInTheDocument();
  });

  it("renders the Settings screen at /settings", async () => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.pushState({}, "", "/settings");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it("mounts the AdminPanel at /admin for an admin session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (String(url).endsWith("/api/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: "u-admin", name: "Waldo", isAdmin: true }),
          });
        }
        if (String(url).endsWith("/api/users")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }),
    );
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: /admin panel/i }),
    ).toBeInTheDocument();
  });
});
