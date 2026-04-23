import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import ErrorPage from "./ErrorPage.jsx";

function setup(props) {
  return render(
    <MemoryRouter>
      <ErrorPage {...props} />
    </MemoryRouter>,
  );
}

describe("ErrorPage", () => {
  it("EP-1: renders a 404 message", () => {
    setup({ status: 404 });
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it("EP-2: renders a 403 message", () => {
    setup({ status: 403 });
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });

  it("EP-3: renders a 500 message", () => {
    setup({ status: 500 });
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("EP-4: renders a back-to-home link", () => {
    setup({ status: 404 });
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/home");
  });
});
