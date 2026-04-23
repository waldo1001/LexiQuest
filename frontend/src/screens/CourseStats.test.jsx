import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProvider } from "../context/AppContext.jsx";
import CourseStats from "./CourseStats.jsx";

const STATS = {
  courseId: "c1",
  courseName: "French 🇫🇷",
  color: "#e11d48",
  masteryDistribution: { new: 5, learning: 10, young: 8, mature: 4, mastered: 3 },
  sessionsOverTime: [{ date: "2026-04-22", value: 2 }],
  cardStruggleList: [
    { cardId: "card1", question: "le chat", failCount: 5 },
    { cardId: "card2", question: "la maison", failCount: 3 },
  ],
  accuracyTrend: [{ date: "2026-04-22", value: 0.75 }],
};

function renderCourseStats({ stats = STATS, courseId = "c1" } = {}) {
  const fetchStats = vi.fn().mockResolvedValue(stats);
  render(
    <AppProvider initialUser={{ id: "u0", name: "Test" }}>
      <MemoryRouter initialEntries={[`/stats/course/${courseId}`]}>
        <Routes>
          <Route path="/stats/course/:courseId" element={<CourseStats fetchStats={fetchStats} />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  return { fetchStats };
}

describe("CourseStats", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("CS-1: shows loading while data pending", () => {
    const fetchStats = vi.fn(() => new Promise(() => {}));
    render(
      <AppProvider initialUser={{ id: "u0", name: "Test" }}>
        <MemoryRouter initialEntries={["/stats/course/c1"]}>
          <Routes>
            <Route path="/stats/course/:courseId" element={<CourseStats fetchStats={fetchStats} />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("CS-2: renders course name in header", async () => {
    renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("course-name")).toHaveTextContent("French 🇫🇷"));
  });

  it("CS-3: renders mastery distribution section", async () => {
    renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("section-mastery")).toBeInTheDocument());
  });

  it("CS-4: renders sessions over time section", async () => {
    renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("section-sessions")).toBeInTheDocument());
  });

  it("CS-5: renders card struggle list with fail counts", async () => {
    renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("section-struggle")).toBeInTheDocument());
    expect(screen.getByText("le chat")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("la maison")).toBeInTheDocument();
  });

  it("CS-6: range selector buttons present", async () => {
    renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("range-30d")).toBeInTheDocument());
    expect(screen.getByTestId("range-7d")).toBeInTheDocument();
    expect(screen.getByTestId("range-90d")).toBeInTheDocument();
  });

  it("CS-7: clicking range re-fetches with new range", async () => {
    const { fetchStats } = renderCourseStats();
    await waitFor(() => expect(screen.getByTestId("range-7d")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("range-7d"));
    await waitFor(() =>
      expect(fetchStats).toHaveBeenLastCalledWith(
        expect.objectContaining({ range: "7d" }),
        expect.anything(),
      ),
    );
  });

  it("CS-8: shows 404 message on not_found error", async () => {
    const fetchStats = vi.fn().mockRejectedValue(new Error("not_found"));
    render(
      <AppProvider initialUser={{ id: "u0", name: "Test" }}>
        <MemoryRouter initialEntries={["/stats/course/gone"]}>
          <Routes>
            <Route path="/stats/course/:courseId" element={<CourseStats fetchStats={fetchStats} />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("not-found")).toBeInTheDocument());
  });
});
