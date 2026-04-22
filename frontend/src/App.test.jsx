import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import App from "./App.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the fetched message from /api/hello", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ msg: "Hello from LexiQuest" }),
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /hello from lexiquest/i }),
    ).toBeInTheDocument();
  });

  it("falls back to the LexiQuest heading when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /^lexiquest$/i }),
    ).toBeInTheDocument();
  });
});
