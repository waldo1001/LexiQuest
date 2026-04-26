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

function renderSetup(state = {}, { fetchCards } = {}) {
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
          <Route path="/courses/:courseId/setup" element={
            <SessionSetup fetchCards={fetchCards ?? vi.fn().mockResolvedValue([])} />
          } />
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

  it("shows upload picker dropdown when cards have upload_id", async () => {
    const cards = [
      { id: "c1", upload_id: "upl-1", upload_name: "Chapter 5", created_at: "2026-04-20T10:00:00Z" },
      { id: "c2", upload_id: "upl-1", upload_name: "Chapter 5", created_at: "2026-04-20T10:00:00Z" },
      { id: "c3", upload_id: null, created_at: "2026-04-19T10:00:00Z" },
    ];
    renderSetup({}, { fetchCards: vi.fn().mockResolvedValue(cards) });
    const select = await screen.findByTestId("upload-picker");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveDisplayValue(/All cards/);
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(2); // "All cards" + "Chapter 5"
    expect(options[1].textContent).toMatch(/Chapter 5/);
  });

  it("selecting an upload from dropdown passes uploadId in navigate state", async () => {
    const cards = [
      { id: "c1", upload_id: "upl-1", upload_name: "Unit 3", created_at: "2026-04-20T10:00:00Z" },
    ];
    renderSetup({}, { fetchCards: vi.fn().mockResolvedValue(cards) });
    const select = await screen.findByTestId("upload-picker");
    fireEvent.change(select, { target: { value: "upl-1" } });
    fireEvent.click(screen.getByText(/Start session/));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/courses/c1/study",
      expect.objectContaining({
        state: expect.objectContaining({ uploadId: "upl-1" }),
      }),
    );
  });

  it("hides upload picker when no cards have upload_id", () => {
    const cards = [
      { id: "c1", upload_id: null, created_at: "2026-04-19T10:00:00Z" },
    ];
    renderSetup({}, { fetchCards: vi.fn().mockResolvedValue(cards) });
    expect(screen.queryByText(/Study specific upload/)).toBeNull();
  });
});
