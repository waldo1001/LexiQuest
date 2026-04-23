import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProvider } from "../context/AppContext.jsx";
import UserStats from "./UserStats.jsx";

const STATS = {
  userId: "u1",
  name: "Lex",
  color: "#e11d48",
  avatar: "👩",
  totalXp: 800,
  level: 4,
  currentStreak: 7,
  longestStreak: 7,
  totalSessions: 12,
  totalCardsStudied: 120,
  totalMinutes: 60,
  accuracyTrend: [{ date: "2026-04-22", value: 0.82 }],
  xpOverTime: [{ date: "2026-04-22", value: 800 }],
  dailyXp: [{ date: "2026-04-22", value: 50 }],
  sessionsPerDay: [{ date: "2026-04-22", value: 1 }],
  timeStudiedPerDay: [{ date: "2026-04-22", value: 5 }],
  hourOfDay: Array.from({ length: 24 }, (_, h) => ({ hour: h, attempts: h * 2 })),
  responseTimeBuckets: [{ bucket: "0-1s", count: 20 }],
  masteryDistribution: { new: 5, learning: 10, young: 8, mature: 4, mastered: 3 },
  badgesEarned: ["first_session", "streak_7"],
};

const HEATMAP = { heatmap: [{ date: "2026-04-22", count: 5 }] };

function renderStats({ stats = STATS, heatmap = HEATMAP, userId = "u1" } = {}) {
  const fetchStats = vi.fn().mockResolvedValue(stats);
  const fetchHeatmap = vi.fn().mockResolvedValue(heatmap);
  render(
    <AppProvider initialUser={{ id: "u0", name: "Test" }}>
      <MemoryRouter initialEntries={[`/stats/user/${userId}`]}>
        <Routes>
          <Route path="/stats/user/:userId" element={<UserStats fetchStats={fetchStats} fetchHeatmap={fetchHeatmap} />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  return { fetchStats, fetchHeatmap };
}

describe("UserStats", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("US-1: shows loading while data pending", () => {
    const fetchStats = vi.fn(() => new Promise(() => {}));
    const fetchHeatmap = vi.fn(() => new Promise(() => {}));
    render(
      <AppProvider initialUser={{ id: "u0", name: "Test" }}>
        <MemoryRouter initialEntries={["/stats/user/u1"]}>
          <Routes>
            <Route path="/stats/user/:userId" element={<UserStats fetchStats={fetchStats} fetchHeatmap={fetchHeatmap} />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("US-2: renders user header with name, level, XP, streak", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByTestId("user-name")).toBeInTheDocument());
    expect(screen.getByTestId("user-name")).toHaveTextContent("Lex");
    expect(screen.getByTestId("user-level")).toHaveTextContent("4");
    expect(screen.getByTestId("user-xp")).toHaveTextContent("800");
    expect(screen.getByTestId("user-streak")).toHaveTextContent("7");
  });

  it("US-3: renders Overview / Per Course / Badges tabs", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByTestId("tab-overview")).toBeInTheDocument());
    expect(screen.getByTestId("tab-courses")).toBeInTheDocument();
    expect(screen.getByTestId("tab-badges")).toBeInTheDocument();
  });

  it("US-4: Overview tab is active by default and shows XP section", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByTestId("section-xp")).toBeInTheDocument());
    expect(screen.getByTestId("section-accuracy")).toBeInTheDocument();
    expect(screen.getByTestId("section-heatmap")).toBeInTheDocument();
  });

  it("US-5: clicking Badges tab shows badges list", async () => {
    renderStats();
    await waitFor(() => expect(screen.getByTestId("tab-badges")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("tab-badges"));
    expect(screen.getByTestId("badges-section")).toBeInTheDocument();
    expect(screen.getByText("first_session")).toBeInTheDocument();
    expect(screen.getByText("streak_7")).toBeInTheDocument();
  });

  it("US-6: range selector buttons present and clicking 7d re-fetches", async () => {
    const { fetchStats } = renderStats();
    await waitFor(() => expect(screen.getByTestId("range-7d")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("range-7d"));
    await waitFor(() =>
      expect(fetchStats).toHaveBeenLastCalledWith(
        expect.objectContaining({ range: "7d" }),
        expect.anything(),
      ),
    );
  });

  it("US-7: fetchHeatmap called with the userId from the route", async () => {
    const { fetchHeatmap } = renderStats({ userId: "u1" });
    await waitFor(() => expect(screen.getByTestId("user-name")).toBeInTheDocument());
    expect(fetchHeatmap).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), expect.anything());
  });

  it("US-8: shows 404 message when stats returns not_found", async () => {
    const fetchStats = vi.fn().mockRejectedValue(new Error("not_found"));
    const fetchHeatmap = vi.fn().mockResolvedValue(HEATMAP);
    render(
      <AppProvider initialUser={{ id: "u0", name: "Test" }}>
        <MemoryRouter initialEntries={["/stats/user/u-gone"]}>
          <Routes>
            <Route path="/stats/user/:userId" element={<UserStats fetchStats={fetchStats} fetchHeatmap={fetchHeatmap} />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("not-found")).toBeInTheDocument());
  });
});
