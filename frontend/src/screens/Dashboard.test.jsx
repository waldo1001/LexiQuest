import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const orig = await importOriginal();
  return { ...orig, useNavigate: () => mockNavigate };
});

const USER = {
  id: "u-lex",
  name: "Lex",
  is_admin: false,
  ui_language: "en",
  settings: {
    auto_speak: false,
    preferred_mode: "self_grade",
    daily_goal: 20,
    streak: 5,
    total_xp: 350,
    freeze_tokens: 0,
  },
};

const COURSES = [
  {
    id: "c1", name: "French", emoji: "🇫🇷", color: "#4f46e5",
    user_id: "u-lex", year_id: "y1",
    language: "fr-FR", default_mode: "self_grade", created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "c2", name: "History", emoji: "📚", color: "#dc2626",
    user_id: "u-lex", year_id: "y1",
    language: null, default_mode: "ask", created_at: "2026-01-01T00:00:00Z",
  },
];

function setup({ initialUser = USER, fetchCourses } = {}) {
  const mockFetchCourses = fetchCourses ?? vi.fn().mockResolvedValue(COURSES);

  return render(
    <AppProvider initialUser={initialUser}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={<Dashboard fetchCourses={mockFetchCourses} />}
          />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("Dashboard", () => {
  it("AC1: shows streak count", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("streak")).toHaveTextContent("5"));
  });

  it("AC2: shows total XP", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("total-xp")).toHaveTextContent("350"));
  });

  it("AC3: shows level derived from XP (floor(350/200)+1 = 2)", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("level")).toHaveTextContent("2"));
  });

  it("AC4: shows daily goal", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("daily-goal")).toBeInTheDocument());
  });

  it("AC5: shows user's courses", async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByText("French")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
    });
  });

  it("AC6: Study button navigates to setup route", async () => {
    setup();
    await waitFor(() => screen.getAllByTestId("study-btn")[0]);
    await userEvent.click(screen.getAllByTestId("study-btn")[0]);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/setup"),
      expect.any(Object),
    );
  });

  it("AC7: shows loading state initially", () => {
    const blockingFetch = vi.fn().mockReturnValue(new Promise(() => {}));
    setup({ fetchCourses: blockingFetch });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("AC8: shows greeting with user name", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId("greeting")).toHaveTextContent("Lex"),
    );
  });

  it("AC9: shows freeze tokens available", async () => {
    const user = { ...USER, settings: { ...USER.settings, freeze_tokens: 2 } };
    setup({ initialUser: user });
    await waitFor(() =>
      expect(screen.getByTestId("freeze-tokens")).toHaveTextContent("2"),
    );
  });
});
