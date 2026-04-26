import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import UploadStats from "./UploadStats.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const COURSE_ID = "c-french";

function setup({ fetchStats = vi.fn(), lang = "en" } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/stats/course/${COURSE_ID}/uploads`,
          state: { courseName: "French" },
        }]}
      >
        <Routes>
          <Route
            path="/stats/course/:courseId/uploads"
            element={<UploadStats fetchStats={fetchStats} />}
          />
          <Route
            path="/courses/:courseId/cards"
            element={<h1 data-testid="cards-screen">Cards</h1>}
          />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

const UPLOAD_A = {
  uploadId: "up-A",
  uploadName: "Chapter 3",
  cardCount: 12,
  createdAt: "2026-04-20T10:00:00.000Z",
  masteryDistribution: { new: 2, learning: 4, young: 3, mature: 2, mastered: 1 },
  avgEase: 2.3,
  totalAttempts: 36,
  correctAttempts: 28,
  accuracyPct: 78,
  lastStudiedAt: "2026-04-25T14:30:00.000Z",
};

const UPLOAD_B = {
  uploadId: "up-B",
  uploadName: null,
  cardCount: 5,
  createdAt: "2026-04-22T08:00:00.000Z",
  masteryDistribution: { new: 5, learning: 0, young: 0, mature: 0, mastered: 0 },
  avgEase: 2.5,
  totalAttempts: 0,
  correctAttempts: 0,
  accuracyPct: 0,
  lastStudiedAt: null,
};

describe("UploadStats", () => {
  it("shows loading state while fetching", () => {
    const fetchStats = vi.fn(() => new Promise(() => {}));
    setup({ fetchStats });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error on fetch failure", async () => {
    const fetchStats = vi.fn().mockRejectedValue(new Error("not_found"));
    setup({ fetchStats });
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });

  it("shows empty message when no uploads", async () => {
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [] });
    setup({ fetchStats });
    await waitFor(() => expect(screen.getByText(/no uploads/i)).toBeInTheDocument());
  });

  it("renders one section per upload with name and card count", async () => {
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_A, UPLOAD_B] });
    setup({ fetchStats });

    await waitFor(() => expect(screen.getByText("Chapter 3")).toBeInTheDocument());
    expect(screen.getByText(/12 cards/i)).toBeInTheDocument();
    expect(screen.getByText(/5 cards/i)).toBeInTheDocument();
  });

  it("renders attempt count and accuracy for each upload", async () => {
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_A] });
    setup({ fetchStats });

    await waitFor(() => expect(screen.getByText(/36 attempts/i)).toBeInTheDocument());
    expect(screen.getByText(/78% accuracy/i)).toBeInTheDocument();
  });

  it("shows 'Never studied' when lastStudiedAt is null", async () => {
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_B] });
    setup({ fetchStats });

    await waitFor(() => expect(screen.getByText(/never studied/i)).toBeInTheDocument());
  });

  it("renders MasteryStack chart per upload after expanding", async () => {
    const user = userEvent.setup();
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_A] });
    setup({ fetchStats });

    await waitFor(() => expect(screen.getByText("Chapter 3")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /chapter 3/i }));
    expect(screen.getByTestId("mastery-stack")).toBeInTheDocument();
  });

  it("range selector triggers re-fetch", async () => {
    const user = userEvent.setup();
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_A] });
    setup({ fetchStats });

    await waitFor(() => expect(fetchStats).toHaveBeenCalledOnce());
    expect(fetchStats).toHaveBeenCalledWith({ courseId: COURSE_ID, range: "30d" }, {});

    await user.click(screen.getByTestId("range-7d"));
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(2));
    expect(fetchStats).toHaveBeenLastCalledWith({ courseId: COURSE_ID, range: "7d" }, {});
  });

  it("renders in Dutch under lang=nl", async () => {
    const fetchStats = vi.fn().mockResolvedValue({ uploads: [UPLOAD_B] });
    setup({ fetchStats, lang: "nl" });
    await waitFor(() => expect(screen.getByText(/nog niet gestudeerd/i)).toBeInTheDocument());
  });
});
