import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import Login from "./Login.jsx";
import { AppProvider } from "../context/AppContext.jsx";

function setup(loginImpl, { lang = "en" } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter initialEntries={["/login/u-alice"]}>
        <Routes>
          <Route path="/login/:userId" element={<Login login={loginImpl} />} />
          <Route path="/home" element={<h1>Home reached</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
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

  it("renders Dutch labels and button under lang=nl", () => {
    setup(vi.fn(), { lang: "nl" });
    expect(
      screen.getByRole("heading", { name: "Voer je wachtwoord in" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Wachtwoord")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Aanmelden" }),
    ).toBeInTheDocument();
  });

  it("shows the Dutch error on rejected login under lang=nl", async () => {
    const user = userEvent.setup();
    const loginImpl = vi.fn().mockRejectedValue(new Error("invalid credentials"));
    setup(loginImpl, { lang: "nl" });

    await user.type(screen.getByLabelText("Wachtwoord"), "nope");
    await user.click(screen.getByRole("button", { name: "Aanmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /ongeldige inloggegevens/i,
    );
  });
});
