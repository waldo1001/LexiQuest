import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import Login from "./Login.jsx";

function setup(loginImpl) {
  return render(
    <MemoryRouter initialEntries={["/login/u-alice"]}>
      <Routes>
        <Route path="/login/:userId" element={<Login login={loginImpl} />} />
        <Route path="/home" element={<h1>Home reached</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Login", () => {
  it("navigates to /home on successful login", async () => {
    const user = userEvent.setup();
    const loginImpl = vi.fn().mockResolvedValue({ id: "u-alice", name: "Alice" });
    setup(loginImpl);

    await user.type(screen.getByLabelText(/password/i), "sekret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("heading", { name: /home reached/i }))
      .toBeInTheDocument();
    expect(loginImpl).toHaveBeenCalledWith({ userId: "u-alice", password: "sekret" });
  });

  it("shows an error on rejected login", async () => {
    const user = userEvent.setup();
    const loginImpl = vi.fn().mockRejectedValue(new Error("invalid credentials"));
    setup(loginImpl);

    await user.type(screen.getByLabelText(/password/i), "nope");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid credentials/i,
    );
  });
});
