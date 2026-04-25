import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SessionResults from "./SessionResults.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, useNavigate: () => mockNavigate };
});

const stubFetchMe = vi.fn().mockResolvedValue({
  id: "u1", name: "Lex", is_admin: false, ui_language: "en",
  settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 20 },
});

function renderWithState(locationState = {}) {
  return render(
    <AppProvider fetchMe={stubFetchMe}>
      <MemoryRouter
        initialEntries={[{ pathname: "/courses/c1/results", state: locationState }]}
      >
        <Routes>
          <Route path="/courses/:courseId/results" element={<SessionResults />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("SessionResults", () => {
  it("AC1: shows cards studied count from location state", () => {
    renderWithState({ cards_studied: 10, cards_correct: 8, duration_seconds: 120 });
    expect(screen.getByTestId("cards-studied")).toHaveTextContent("10");
  });

  it("AC2: shows cards correct count from location state", () => {
    renderWithState({ cards_studied: 10, cards_correct: 8, duration_seconds: 120 });
    expect(screen.getByTestId("cards-correct")).toHaveTextContent("8");
  });

  it("AC3: shows accuracy percentage (correct / studied)", () => {
    renderWithState({ cards_studied: 10, cards_correct: 8, duration_seconds: 120 });
    expect(screen.getByTestId("accuracy")).toHaveTextContent("80%");
  });

  it("AC4: shows time taken in mm:ss format", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 90 });
    expect(screen.getByTestId("duration")).toHaveTextContent("1:30");
  });

  it("AC5: shows XP placeholder when xp_earned is 0", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60, xp_earned: 0 });
    expect(screen.getByTestId("xp-earned")).toHaveTextContent("+0 XP");
  });

  it("AC6: shows actual XP when provided", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60, xp_earned: 150 });
    expect(screen.getByTestId("xp-earned")).toHaveTextContent("+150 XP");
  });

  it("AC7: Back to course button navigates to /courses", async () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60 });
    await userEvent.click(screen.getByTestId("back-btn"));
    expect(mockNavigate).toHaveBeenCalledWith("/courses");
  });

  it("AC8: Study again button navigates to setup route", async () => {
    renderWithState({
      cards_studied: 5,
      cards_correct: 5,
      duration_seconds: 60,
      courseId: "c1",
      courseName: "French",
      mode: "self_grade",
    });
    await userEvent.click(screen.getByTestId("study-again-btn"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/courses/c1/setup",
      expect.objectContaining({ state: expect.objectContaining({ courseName: "French" }) }),
    );
  });

  it("AC9: handles missing state gracefully (no crash)", () => {
    renderWithState(null);
    expect(screen.getByTestId("cards-studied")).toBeInTheDocument();
  });

  it("AC10: 100% accuracy shown when all cards correct", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 30 });
    expect(screen.getByTestId("accuracy")).toHaveTextContent("100%");
  });

  it("AC11: 0% accuracy when no cards correct", () => {
    renderWithState({ cards_studied: 5, cards_correct: 0, duration_seconds: 30 });
    expect(screen.getByTestId("accuracy")).toHaveTextContent("0%");
  });

  it("AC12: accuracy is 0% when no cards studied", () => {
    renderWithState({ cards_studied: 0, cards_correct: 0, duration_seconds: 0 });
    expect(screen.getByTestId("accuracy")).toHaveTextContent("0%");
  });

  it("AC13: classic results show no game type indicator", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60, gameType: "classic" });
    expect(screen.queryByTestId("game-type-badge")).toBeNull();
  });

  it("AC14: boss_round results show game type badge", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60, gameType: "boss_round" });
    expect(screen.getByTestId("game-type-badge")).toHaveTextContent(/Boss Round/);
  });

  it("AC15: speed_round results show cards per minute", () => {
    renderWithState({ cards_studied: 10, cards_correct: 8, duration_seconds: 60, gameType: "speed_round" });
    expect(screen.getByTestId("cards-per-minute")).toHaveTextContent("10");
  });

  it("AC16: XP multiplier displayed for boss_round", () => {
    renderWithState({ cards_studied: 5, cards_correct: 5, duration_seconds: 60, gameType: "boss_round", xp_earned: 100 });
    expect(screen.getByTestId("xp-multiplier")).toHaveTextContent("1.5x XP");
  });

  it("AC17: Study again navigates to setup instead of study", async () => {
    renderWithState({
      cards_studied: 5,
      cards_correct: 5,
      duration_seconds: 60,
      courseName: "French",
      gameType: "boss_round",
    });
    await userEvent.click(screen.getByTestId("study-again-btn"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/setup"),
      expect.anything(),
    );
  });
});
