import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SessionSetup from "./SessionSetup.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderSetup(state = {}) {
  const defaultState = {
    courseName: "French",
    courseLang: "fr-FR",
    defaultMode: "ask",
    ...state,
  };
  return render(
    <AppProvider overrides={{ user: { id: "u1", name: "Lex", settings: {} } }}>
      <MemoryRouter
        initialEntries={[
          { pathname: "/courses/c1/setup", state: defaultState },
        ]}
      >
        <Routes>
          <Route path="/courses/:courseId/setup" element={<SessionSetup />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("SessionSetup", () => {
  it("renders 4 game type buttons", () => {
    renderSetup();
    expect(screen.getByText("Classic")).toBeTruthy();
    expect(screen.getByText("Boss Round")).toBeTruthy();
    expect(screen.getByText("Speed Round")).toBeTruthy();
    expect(screen.getByText("Review Blitz")).toBeTruthy();
  });

  it("renders card count pills", () => {
    renderSetup();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("All")).toBeTruthy();
  });

  it("default selection is Classic + 20", () => {
    renderSetup();
    const classicBtn = screen.getByText("Classic").closest("button");
    const twentyBtn = screen.getByText("20").closest("button");
    expect(classicBtn.className).toContain("selected");
    expect(twentyBtn.className).toContain("selected");
  });

  it("Start Session navigates with correct state", () => {
    renderSetup();
    fireEvent.click(screen.getByText(/Start session/));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/courses/c1/study",
      expect.objectContaining({
        state: expect.objectContaining({
          gameType: "classic",
          cardLimit: 20,
          mode: "self_grade",
          courseName: "French",
        }),
      }),
    );
  });

  it("selecting Boss Round + 10 navigates with those values", () => {
    renderSetup();
    fireEvent.click(screen.getByText("Boss Round"));
    fireEvent.click(screen.getByText("10"));
    fireEvent.click(screen.getByText(/Start session/));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/courses/c1/study",
      expect.objectContaining({
        state: expect.objectContaining({
          gameType: "boss_round",
          cardLimit: 10,
        }),
      }),
    );
  });

  it("selecting All sets cardLimit to null", () => {
    renderSetup();
    fireEvent.click(screen.getByText("All"));
    fireEvent.click(screen.getByText(/Start session/));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/courses/c1/study",
      expect.objectContaining({
        state: expect.objectContaining({ cardLimit: null }),
      }),
    );
  });

  it("mode picker appears when defaultMode is ask", () => {
    renderSetup({ defaultMode: "ask" });
    expect(screen.getByText(/Self-grade/)).toBeTruthy();
    expect(screen.getByText(/Multiple choice/)).toBeTruthy();
    expect(screen.getByText(/Mixed/)).toBeTruthy();
  });

  it("mode picker hidden when defaultMode is explicit", () => {
    renderSetup({ defaultMode: "mcq" });
    expect(screen.queryByText(/Choose study mode/)).toBeNull();
  });
});
