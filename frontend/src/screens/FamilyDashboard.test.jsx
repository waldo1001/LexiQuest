import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "../context/AppContext.jsx";
import FamilyDashboard from "./FamilyDashboard.jsx";

const USERS = [
  { userId: "u1", name: "Lex", color: "#e11d48", avatar: "👩", xp: 400, streak: 5, accuracy: 0.82, sessionsLastN: 3, cardsLastN: 30 },
  { userId: "u2", name: "Mats", color: "#2563eb", avatar: "👦", xp: 200, streak: 2, accuracy: 0.75, sessionsLastN: 2, cardsLastN: 15 },
];

const SERIES = [
  { date: "2026-04-21", u1: 100, u2: 50 },
  { date: "2026-04-22", u1: 150, u2: 60 },
];

function makeFamily(overrides = {}) {
  return { users: USERS, ...overrides };
}
function makeCompare() {
  return { series: SERIES };
}

function renderDash(props = {}) {
  const fetchFamily = props.fetchFamily ?? vi.fn().mockResolvedValue(makeFamily());
  const fetchCompare = props.fetchCompare ?? vi.fn().mockResolvedValue(makeCompare());
  const mockNavigate = vi.fn();
  vi.mock("react-router-dom", async (imp) => {
    const actual = await imp();
    return { ...actual, useNavigate: () => mockNavigate };
  });
  render(
    <AppProvider initialUser={{ id: "u0", name: "Test" }}>
      <MemoryRouter>
        <FamilyDashboard fetchFamily={fetchFamily} fetchCompare={fetchCompare} />
      </MemoryRouter>
    </AppProvider>,
  );
  return { fetchFamily, fetchCompare, mockNavigate };
}

describe("FamilyDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("FD-1: shows loading while data is pending", () => {
    renderDash({ fetchFamily: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("FD-2: renders a user card per family member with name + streak + XP", async () => {
    renderDash();
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    expect(screen.getByText("Lex")).toBeInTheDocument();
    expect(screen.getByText("Mats")).toBeInTheDocument();
    // streak and XP visible
    expect(screen.getByTestId("streak-u1")).toHaveTextContent("5");
    expect(screen.getByTestId("xp-u1")).toHaveTextContent("400");
  });

  it("FD-3: user card is a link to /stats/user/:userId", async () => {
    renderDash();
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    const card = screen.getByTestId("family-user-card-u1");
    expect(card.closest("a")).toHaveAttribute("href", "/stats/user/u1");
  });

  it("FD-4: renders range selector with 7d, 30d, 90d, 1y, all buttons", async () => {
    renderDash();
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    expect(screen.getByTestId("range-7d")).toBeInTheDocument();
    expect(screen.getByTestId("range-30d")).toBeInTheDocument();
    expect(screen.getByTestId("range-90d")).toBeInTheDocument();
    expect(screen.getByTestId("range-1y")).toBeInTheDocument();
    expect(screen.getByTestId("range-all")).toBeInTheDocument();
  });

  it("FD-5: clicking 90d range re-fetches with range=90d", async () => {
    const fetchFamily = vi.fn().mockResolvedValue(makeFamily());
    const fetchCompare = vi.fn().mockResolvedValue(makeCompare());
    renderDash({ fetchFamily, fetchCompare });
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    fireEvent.click(screen.getByTestId("range-90d"));
    await waitFor(() =>
      expect(fetchFamily).toHaveBeenLastCalledWith(expect.objectContaining({ range: "90d" }), expect.anything()),
    );
  });

  it("FD-6: renders XP over time section heading", async () => {
    renderDash();
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    expect(screen.getByTestId("section-xp")).toBeInTheDocument();
  });

  it("FD-7: renders accuracy trend section heading", async () => {
    renderDash();
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    expect(screen.getByTestId("section-accuracy")).toBeInTheDocument();
  });

  it("FD-8: fetchCompare called with metric=xp and metric=accuracy on mount", async () => {
    const fetchCompare = vi.fn().mockResolvedValue(makeCompare());
    renderDash({ fetchCompare });
    await waitFor(() => expect(screen.getAllByTestId("family-user-card")).toHaveLength(2));
    const calls = fetchCompare.mock.calls.map((c) => c[0].metric);
    expect(calls).toContain("xp");
    expect(calls).toContain("accuracy");
  });
});
