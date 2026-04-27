import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import UserPicker from "./UserPicker.jsx";
import { AppProvider } from "../context/AppContext.jsx";

function setup(fetchUsersImpl, { lang = "en" } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter>
        <UserPicker fetchUsers={fetchUsersImpl} />
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("UserPicker", () => {
  it("renders fetched users as links", async () => {
    setup(
      vi.fn().mockResolvedValue([
        { id: "u1", name: "Alice", avatar_emoji: "🦊", color: "#abc" },
        { id: "u2", name: "Bob", avatar_emoji: "🦉", color: "#def" },
      ]),
    );

    const alice = await screen.findByTestId("picker-u1");
    expect(alice).toHaveAttribute("href", "/login/u1");
    expect(alice.textContent).toContain("Alice");

    const bob = screen.getByTestId("picker-u2");
    expect(bob).toHaveAttribute("href", "/login/u2");
  });

  it("shows an error message on fetch failure (English)", async () => {
    setup(vi.fn().mockRejectedValue(new Error("boom")));
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/could not load users/i);
  });

  it("shows loading state before the fetch resolves", () => {
    setup(() => new Promise(() => {}));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the Dutch heading under lang=nl", async () => {
    setup(vi.fn().mockResolvedValue([]), { lang: "nl" });
    expect(
      await screen.findByRole("heading", { name: "Wie ben jij?" }),
    ).toBeInTheDocument();
  });

  it("renders the Dutch error text under lang=nl", async () => {
    setup(vi.fn().mockRejectedValue(new Error("boom")), { lang: "nl" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /kon gebruikers niet laden/i,
    );
  });

  it("renders each user tile with .card class", async () => {
    setup(
      vi.fn().mockResolvedValue([
        { id: "u1", name: "Alice", avatar_emoji: "🦊", color: "#abc" },
        { id: "u2", name: "Bob", avatar_emoji: "🦉", color: "#def" },
      ]),
    );
    const alice = await screen.findByTestId("picker-u1");
    const bob = screen.getByTestId("picker-u2");
    expect(alice).toHaveClass("card");
    expect(bob).toHaveClass("card");
  });

  it("AVATAR-16: tile with avatar_image_url renders <img>; tile with only emoji renders the emoji span", async () => {
    setup(
      vi.fn().mockResolvedValue([
        {
          id: "u-waldo",
          name: "Waldo",
          avatar_emoji: "🦊",
          avatar_image_url: "/icons/icon-192.png",
          color: "#abc",
        },
        {
          id: "u-lex",
          name: "Lex",
          avatar_emoji: "🐯",
          avatar_image_url: null,
          color: "#def",
        },
      ]),
    );
    const waldoTile = await screen.findByTestId("picker-u-waldo");
    const img = waldoTile.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/icons/icon-192.png");

    const lexTile = screen.getByTestId("picker-u-lex");
    expect(lexTile.querySelector("img")).toBeNull();
    expect(lexTile.textContent).toContain("🐯");
  });
});
