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
});
