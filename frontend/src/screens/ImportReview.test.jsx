import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ImportReview from "./ImportReview.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const COURSE_ID = "course-fr";
const COURSE_NAME = "French 🇫🇷";

const CANDIDATES = [
  { question: "le chien", answer: "the dog", distractors: ["the cat", "the bird"] },
  { question: "la maison", answer: "the house", distractors: ["the car", "the tree"] },
];

function setup({ batchCreateCards = vi.fn(), candidates = CANDIDATES, lang = "en" } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/courses/${COURSE_ID}/import/review`,
          state: { courseId: COURSE_ID, courseName: COURSE_NAME, candidates },
        }]}
      >
        <Routes>
          <Route
            path="/courses/:courseId/import/review"
            element={<ImportReview batchCreateCards={batchCreateCards} />}
          />
          <Route
            path="/courses/:courseId/cards"
            element={<h1 data-testid="cards-screen">Cards</h1>}
          />
          <Route
            path="/courses/:courseId/import"
            element={<h1 data-testid="import-screen">Import</h1>}
          />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("ImportReview", () => {
  it("renders the review heading", () => {
    setup();
    expect(screen.getByRole("heading", { name: /review extracted/i })).toBeInTheDocument();
  });

  it("shows all candidate cards", () => {
    setup();
    expect(screen.getByText("le chien")).toBeInTheDocument();
    expect(screen.getByText("la maison")).toBeInTheDocument();
  });

  it("shows checkboxes for each card (default checked)", () => {
    setup();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("shows save button", () => {
    setup();
    expect(screen.getByRole("button", { name: /save selected/i })).toBeInTheDocument();
  });

  it("shows empty message when no candidates", () => {
    setup({ candidates: [] });
    expect(screen.getByText(/no cards were extracted/i)).toBeInTheDocument();
  });

  it("shows error when save clicked with none selected", async () => {
    const user = userEvent.setup();
    setup();
    const checkboxes = screen.getAllByRole("checkbox");
    for (const cb of checkboxes) await user.click(cb);
    await user.click(screen.getByRole("button", { name: /save selected/i }));
    expect(screen.getByText(/at least one/i)).toBeInTheDocument();
  });

  it("calls batchCreateCards with selected cards", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const call = batchCreateCards.mock.calls[0][0];
    expect(call.courseId).toBe(COURSE_ID);
    expect(call.cards).toHaveLength(2);
  });

  it("navigates to cards screen on success", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() =>
      expect(screen.getByTestId("cards-screen")).toBeInTheDocument(),
    );
  });

  it("shows error on save failure", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockRejectedValue(new Error("forbidden"));
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument(),
    );
  });

  it("shows saving state while saving", async () => {
    const user = userEvent.setup();
    let resolve;
    const batchCreateCards = vi.fn(() => new Promise((res) => { resolve = res; }));
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
    resolve({ cards: [] });
  });

  it("unchecking a card removes it from save payload", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]); // uncheck first

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const call = batchCreateCards.mock.calls[0][0];
    expect(call.cards).toHaveLength(1);
    expect(call.cards[0].question).toBe("la maison");
  });

  it("renders in Dutch under lang=nl", () => {
    setup({ lang: "nl" });
    expect(screen.getByRole("heading", { name: /nakijken/i })).toBeInTheDocument();
  });

  it("back link is present", () => {
    setup();
    expect(screen.getByRole("link", { name: /back/i })).toBeInTheDocument();
  });

  it("renders without location state (no crash — tests state ?? {} branch)", () => {
    render(
      <AppProvider>
        <MemoryRouter initialEntries={[`/courses/${COURSE_ID}/import/review`]}>
          <Routes>
            <Route path="/courses/:courseId/import/review" element={<ImportReview />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    expect(screen.getByText(/no cards were extracted/i)).toBeInTheDocument();
  });

  it("saves card with null distractors as empty array (distractors ?? [] branch)", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    const candidatesNoDistractors = [{ question: "Q", answer: "A" }];
    setup({ batchCreateCards, candidates: candidatesNoDistractors });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const call = batchCreateCards.mock.calls[0][0];
    expect(call.cards[0].distractors).toEqual([]);
  });
});
