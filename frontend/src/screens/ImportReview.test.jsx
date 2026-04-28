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

function setup({
  batchCreateCards = vi.fn(),
  candidates = CANDIDATES,
  lang = "en",
  courseLang = null,
  currentUser,
  uploadId,
  uploadName,
} = {}) {
  return render(
    <AppProvider initialLang={lang} initialUser={currentUser}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/courses/${COURSE_ID}/import/review`,
          state: { courseId: COURSE_ID, courseName: COURSE_NAME, candidates, courseLang, uploadId, uploadName },
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
    expect(checkboxes).toHaveLength(3); // 2 card checkboxes + 1 bidirectional
    // Card checkboxes are all checked
    const cardCheckboxes = checkboxes.filter((cb) => cb !== screen.getByLabelText(/also create reverse cards/i));
    cardCheckboxes.forEach((cb) => expect(cb).toBeChecked());
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
    // checkboxes[0] is the bidirectional checkbox, card checkboxes start at 1
    await user.click(checkboxes[1]); // uncheck first card

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

  it("passes question_lang and answer_lang through to batchCreateCards", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    const candidatesWithLang = [
      { question: "the dog", answer: "le chien", distractors: ["le chat", "le cheval"], question_lang: "en", answer_lang: "fr-FR" },
    ];
    setup({ batchCreateCards, candidates: candidatesWithLang });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const card = batchCreateCards.mock.calls[0][0].cards[0];
    expect(card.question_lang).toBe("en");
    expect(card.answer_lang).toBe("fr-FR");
  });

  it("defaults missing question_lang and answer_lang to null in batch payload", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const card = batchCreateCards.mock.calls[0][0].cards[0];
    expect(card.question_lang).toBeNull();
    expect(card.answer_lang).toBeNull();
  });

  it("shows 'Also create reverse cards' checkbox on Import Review", () => {
    setup();
    expect(screen.getByLabelText(/also create reverse cards/i)).toBeInTheDocument();
  });

  it("defaults checkbox on when course.language differs from user.ui_language", () => {
    setup({
      courseLang: "fr-FR",
      currentUser: { id: "u1", name: "Lex", isAdmin: false, ui_language: "en" },
    });
    expect(screen.getByLabelText(/also create reverse cards/i)).toBeChecked();
  });

  it("defaults checkbox off when course has no language", () => {
    setup({
      courseLang: null,
      currentUser: { id: "u1", name: "Lex", isAdmin: false, ui_language: "en" },
    });
    expect(screen.getByLabelText(/also create reverse cards/i)).not.toBeChecked();
  });

  it("submits bidirectional=true to /api/cards/batch when checkbox ticked", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({
      batchCreateCards,
      courseLang: "fr-FR",
      currentUser: { id: "u1", name: "Lex", isAdmin: false, ui_language: "en" },
    });

    // checkbox is on by default
    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());
    expect(batchCreateCards.mock.calls[0][0].bidirectional).toBe(true);
  });

  it("submits bidirectional=false when checkbox unticked", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({
      batchCreateCards,
      courseLang: "fr-FR",
      currentUser: { id: "u1", name: "Lex", isAdmin: false, ui_language: "en" },
    });

    await user.click(screen.getByLabelText(/also create reverse cards/i));
    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());
    expect(batchCreateCards.mock.calls[0][0].bidirectional).toBe(false);
  });

  it("sends uploadName when filled in", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    await user.type(screen.getByPlaceholderText(/chapter 3/i), "Unit 5 vocab");
    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    expect(batchCreateCards.mock.calls[0][0].uploadName).toBe("Unit 5 vocab");
  });

  it("does not send uploadName when left empty", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ cards: [] });
    setup({ batchCreateCards });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    expect(batchCreateCards.mock.calls[0][0].uploadName).toBeUndefined();
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

// =====================================================================
// Slice B — uploadId passthrough (append to existing upload)
// =====================================================================
describe("ImportReview — append to existing upload", () => {
  it("IR-B1: with uploadId in state, sends uploadId to batchCreateCards (no uploadName)", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ upload_id: "up-1", cards: [] });
    setup({ batchCreateCards, uploadId: "up-1" });

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const call = batchCreateCards.mock.calls[0][0];
    expect(call.uploadId).toBe("up-1");
    expect(call.uploadName).toBeUndefined();
  });

  it("IR-B2: with uploadId in state, hides the 'name this upload' input (using existing name)", () => {
    setup({ uploadId: "up-1", uploadName: "Math homework" });
    expect(screen.queryByLabelText(/name this upload/i)).toBeNull();
  });

  it("IR-B3: with uploadName in state but no uploadId, sends uploadName as before (regression)", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ upload_id: "fresh", cards: [] });
    setup({ batchCreateCards });

    const nameInput = screen.getByLabelText(/name this upload/i);
    await user.type(nameInput, "Brand new");
    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const call = batchCreateCards.mock.calls[0][0];
    expect(call.uploadName).toBe("Brand new");
    expect(call.uploadId).toBeUndefined();
  });

  it("IR-SWAP1: swap button swaps question and answer for that card", async () => {
    const user = userEvent.setup();
    setup();

    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    expect(swapButtons).toHaveLength(2);

    // First card: "le chien" → "the dog"
    expect(screen.getByText("le chien")).toBeInTheDocument();

    await user.click(swapButtons[0]);

    // After swap: "the dog" should now appear as the bolded question
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("the dog");
    expect(items[0]).toHaveTextContent("le chien");
  });

  it("IR-SWAP2: swapped card is saved with question and answer reversed", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ upload_id: "u1", cards: [] });
    setup({ batchCreateCards });

    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    await user.click(swapButtons[0]);

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const saved = batchCreateCards.mock.calls[0][0].cards;
    expect(saved[0].question).toBe("the dog");
    expect(saved[0].answer).toBe("le chien");
    // Second card unchanged
    expect(saved[1].question).toBe("la maison");
    expect(saved[1].answer).toBe("the house");
  });

  it("IR-SWAP3: swapping twice restores original order", async () => {
    const user = userEvent.setup();
    const batchCreateCards = vi.fn().mockResolvedValue({ upload_id: "u1", cards: [] });
    setup({ batchCreateCards });

    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    await user.click(swapButtons[0]);
    await user.click(swapButtons[0]);

    await user.click(screen.getByRole("button", { name: /save selected/i }));
    await waitFor(() => expect(batchCreateCards).toHaveBeenCalledOnce());

    const saved = batchCreateCards.mock.calls[0][0].cards;
    expect(saved[0].question).toBe("le chien");
    expect(saved[0].answer).toBe("the dog");
  });
});
