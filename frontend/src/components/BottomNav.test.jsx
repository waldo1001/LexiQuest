import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { AppProvider } from "../context/AppContext.jsx";
import BottomNav from "./BottomNav.jsx";

function setup(initialPath = "/home") {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<BottomNav />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("BottomNav", () => {
  it("BN-1: renders a nav element", () => {
    setup();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("BN-2: contains a link to /dashboard", () => {
    setup();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  it("BN-3: contains a link to /home (Study)", () => {
    setup();
    expect(screen.getByRole("link", { name: /study/i })).toHaveAttribute("href", "/home");
  });

  it("BN-4: contains a link to /family", () => {
    setup();
    expect(screen.getByRole("link", { name: /family/i })).toHaveAttribute("href", "/family");
  });

  it("BN-5: contains a link to /settings", () => {
    setup();
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
  });

  it("BN-6: active link for current path has aria-current=page", () => {
    setup("/dashboard");
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("aria-current", "page");
  });

  it("BN-7: non-active links do not have aria-current=page", () => {
    setup("/dashboard");
    expect(screen.getByRole("link", { name: /study/i })).not.toHaveAttribute("aria-current", "page");
  });

  it("BN-8: contains a link to / (Users picker)", () => {
    setup();
    expect(screen.getByRole("link", { name: /users/i })).toHaveAttribute("href", "/");
  });
});
