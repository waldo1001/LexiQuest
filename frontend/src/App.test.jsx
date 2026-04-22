import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App.jsx";

describe("App", () => {
  it("renders a LexiQuest heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /lexiquest/i }),
    ).toBeInTheDocument();
  });
});
