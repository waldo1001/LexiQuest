import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import Home from "./Home.jsx";

function setup({ fetchMe, logout }) {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route
          path="/home"
          element={<Home fetchMe={fetchMe} logout={logout} />}
        />
        <Route path="/" element={<h1>Picker</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home", () => {
  it("greets the user after fetchMe resolves", async () => {
    setup({
      fetchMe: vi.fn().mockResolvedValue({ id: "u1", name: "Alice" }),
      logout: vi.fn(),
    });
    expect(
      await screen.findByRole("heading", { name: /hello, alice/i }),
    ).toBeInTheDocument();
  });

  it("navigates to / after logout", async () => {
    const user = userEvent.setup();
    const logoutFn = vi.fn().mockResolvedValue(undefined);
    setup({
      fetchMe: vi.fn().mockResolvedValue({ id: "u1", name: "Alice" }),
      logout: logoutFn,
    });
    await user.click(await screen.findByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: /picker/i })).toBeInTheDocument();
    expect(logoutFn).toHaveBeenCalled();
  });

  it("shows a 'not signed in' alert when fetchMe rejects", async () => {
    setup({
      fetchMe: vi.fn().mockRejectedValue(new Error("unauthorized")),
      logout: vi.fn(),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not signed in/i);
  });
});
