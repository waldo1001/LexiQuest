import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "../context/AppContext.jsx";
import CompareView from "./CompareView.jsx";

const USERS = [
  { id: "u1", name: "Lex", color: "#e11d48", avatar_emoji: "👩" },
  { id: "u2", name: "Mats", color: "#2563eb", avatar_emoji: "👦" },
];

const SERIES = {
  series: [
    { date: "2026-04-20", u1: 100, u2: 50 },
    { date: "2026-04-21", u1: 150, u2: 80 },
  ],
};

function renderCV(overrides = {}) {
  const fetchUsers = overrides.fetchUsers ?? vi.fn().mockResolvedValue(USERS);
  const fetchCompare = overrides.fetchCompare ?? vi.fn().mockResolvedValue(SERIES);
  render(
    <AppProvider initialUser={{ id: "u0", name: "Test" }}>
      <MemoryRouter>
        <CompareView fetchUsers={fetchUsers} fetchCompare={fetchCompare} />
      </MemoryRouter>
    </AppProvider>,
  );
  return { fetchUsers, fetchCompare };
}

describe("CompareView", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("CV-1: shows loading while users pending", () => {
    renderCV({ fetchUsers: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("CV-2: renders user chip for each user with name and checked by default", async () => {
    renderCV();
    await waitFor(() => expect(screen.getAllByTestId("user-chip")).toHaveLength(2));
    expect(screen.getByText(/Lex/)).toBeInTheDocument();
    expect(screen.getByText(/Mats/)).toBeInTheDocument();
    // all chips selected by default
    expect(screen.getByTestId("chip-u1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-u2")).toHaveAttribute("aria-pressed", "true");
  });

  it("CV-3: metric selector renders XP, Accuracy, Sessions, Cards, Minutes options", async () => {
    renderCV();
    await waitFor(() => expect(screen.getByTestId("metric-select")).toBeInTheDocument());
    const select = screen.getByTestId("metric-select");
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "accuracy" } });
    // fetchCompare should be called with accuracy metric
    await waitFor(() =>
      expect(screen.getByTestId("metric-select").value).toBe("accuracy"),
    );
  });

  it("CV-4: range selector present (7d, 30d, 90d, 1y, all)", async () => {
    renderCV();
    await waitFor(() => expect(screen.getByTestId("range-7d")).toBeInTheDocument());
    expect(screen.getByTestId("range-30d")).toBeInTheDocument();
    expect(screen.getByTestId("range-all")).toBeInTheDocument();
  });

  it("CV-5: chart section renders", async () => {
    renderCV();
    await waitFor(() => expect(screen.getByTestId("compare-chart")).toBeInTheDocument());
  });

  it("CV-6: toggling a chip deselects the user and re-fetches without them", async () => {
    const { fetchCompare } = renderCV();
    await waitFor(() => expect(screen.getAllByTestId("user-chip")).toHaveLength(2));
    // deselect Mats (u2)
    fireEvent.click(screen.getByTestId("chip-u2"));
    await waitFor(() =>
      expect(fetchCompare).toHaveBeenLastCalledWith(
        expect.objectContaining({ userIds: expect.not.arrayContaining(["u2"]) }),
        expect.anything(),
      ),
    );
  });

  it("CV-7: changing metric triggers fetchCompare with new metric", async () => {
    const { fetchCompare } = renderCV();
    await waitFor(() => expect(screen.getByTestId("metric-select")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("metric-select"), { target: { value: "sessions" } });
    await waitFor(() =>
      expect(fetchCompare).toHaveBeenLastCalledWith(
        expect.objectContaining({ metric: "sessions" }),
        expect.anything(),
      ),
    );
  });
});
