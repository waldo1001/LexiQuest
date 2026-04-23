import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProvider } from "../context/AppContext.jsx";
import Leaderboard from "./Leaderboard.jsx";

const LEADERBOARD = {
  rankings: [
    { userId: "u1", name: "Lex", color: "#e11d48", avatar: "👩", xp: 1000, sessions: 8, cardsStudied: 80, accuracy: 85, streak: 7 },
    { userId: "u2", name: "Mats", color: "#2563eb", avatar: "👦", xp: 600, sessions: 5, cardsStudied: 50, accuracy: 72, streak: 3 },
    { userId: "u3", name: "Ben", color: "#16a34a", avatar: "🧒", xp: 200, sessions: 2, cardsStudied: 20, accuracy: 60, streak: 1 },
  ],
  mostAccurate: { userId: "u1", name: "Lex", accuracy: 85 },
  longestStreak: { userId: "u1", name: "Lex", streak: 7 },
  mostSessions: { userId: "u1", name: "Lex", sessions: 8 },
};

function renderLB(fetchLeaderboard = vi.fn().mockResolvedValue(LEADERBOARD)) {
  render(
    <AppProvider initialUser={{ id: "u0", name: "Test" }}>
      <MemoryRouter>
        <Leaderboard fetchLeaderboard={fetchLeaderboard} />
      </MemoryRouter>
    </AppProvider>,
  );
  return { fetchLeaderboard };
}

describe("Leaderboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("LB-UI-1: shows loading while data pending", () => {
    renderLB(vi.fn(() => new Promise(() => {})));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("LB-UI-2: renders ranked list with names and XP", async () => {
    renderLB();
    await waitFor(() => expect(screen.getAllByTestId("ranking-row")).toHaveLength(3));
    expect(screen.getAllByText("Lex").length).toBeGreaterThan(0);
    expect(screen.getByText("Mats")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText("600")).toBeInTheDocument();
  });

  it("LB-UI-3: period selector buttons 7d, 30d, all present", async () => {
    renderLB();
    await waitFor(() => expect(screen.getByTestId("period-7d")).toBeInTheDocument());
    expect(screen.getByTestId("period-30d")).toBeInTheDocument();
    expect(screen.getByTestId("period-all")).toBeInTheDocument();
  });

  it("LB-UI-4: clicking period re-fetches with new period", async () => {
    const { fetchLeaderboard } = renderLB();
    await waitFor(() => expect(screen.getByTestId("period-7d")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("period-7d"));
    await waitFor(() =>
      expect(fetchLeaderboard).toHaveBeenLastCalledWith(
        expect.objectContaining({ period: "7d" }),
        expect.anything(),
      ),
    );
  });

  it("LB-UI-5: renders three secondary award cards (mostAccurate, longestStreak, mostSessions)", async () => {
    renderLB();
    await waitFor(() => expect(screen.getByTestId("award-mostAccurate")).toBeInTheDocument());
    expect(screen.getByTestId("award-longestStreak")).toBeInTheDocument();
    expect(screen.getByTestId("award-mostSessions")).toBeInTheDocument();
  });

  it("LB-UI-6: each ranking row has rank number", async () => {
    renderLB();
    await waitFor(() => expect(screen.getAllByTestId("ranking-row")).toHaveLength(3));
    expect(screen.getByTestId("rank-1")).toBeInTheDocument();
    expect(screen.getByTestId("rank-2")).toBeInTheDocument();
    expect(screen.getByTestId("rank-3")).toBeInTheDocument();
  });

  it("LB-UI-7: ranking row links to /stats/user/:userId", async () => {
    renderLB();
    await waitFor(() => expect(screen.getAllByTestId("ranking-row")).toHaveLength(3));
    const rows = screen.getAllByTestId("ranking-row");
    expect(rows[0].closest("a")).toHaveAttribute("href", "/stats/user/u1");
  });
});
