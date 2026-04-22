import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import AdminRoute from "./AdminRoute.jsx";
import { AppProvider } from "../context/AppContext.jsx";

function setup({ fetchMe, childFn } = {}) {
  const child =
    childFn ??
    (() => <h1>Admin Panel</h1>);
  return render(
    <AppProvider initialLang="en">
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute fetchMe={fetchMe}>{child}</AdminRoute>
            }
          />
          <Route path="/home" element={<h1>Home</h1>} />
          <Route path="/" element={<h1>Picker</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("AdminRoute", () => {
  it("shows a loading state while fetchMe is pending", () => {
    setup({ fetchMe: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
  });

  it("renders children when the user is admin", async () => {
    setup({
      fetchMe: vi.fn().mockResolvedValue({ id: "u1", isAdmin: true }),
    });
    expect(
      await screen.findByRole("heading", { name: /admin panel/i }),
    ).toBeInTheDocument();
  });

  it("passes the admin user to a render-prop child", async () => {
    const childFn = vi.fn((user) => (
      <p>{`admin-id=${user?.id ?? "?"}`}</p>
    ));
    setup({
      fetchMe: vi.fn().mockResolvedValue({ id: "u-admin-42", isAdmin: true }),
      childFn,
    });
    expect(await screen.findByText("admin-id=u-admin-42")).toBeInTheDocument();
  });

  it("redirects to /home when the user is not admin", async () => {
    setup({
      fetchMe: vi.fn().mockResolvedValue({ id: "u1", isAdmin: false }),
    });
    expect(
      await screen.findByRole("heading", { name: /home/i }),
    ).toBeInTheDocument();
  });

  it("redirects to / when fetchMe throws (unauthenticated)", async () => {
    setup({
      fetchMe: vi.fn().mockRejectedValue(new Error("unauthorized")),
    });
    expect(
      await screen.findByRole("heading", { name: /picker/i }),
    ).toBeInTheDocument();
  });
});
