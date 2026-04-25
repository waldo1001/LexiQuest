import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import CardManager from "./CardManager.jsx";
import { createFakeTts } from "../testing/fake-tts.js";
import { AppProvider } from "../context/AppContext.jsx";

const OWNER_ID = "u-lex";
const OTHER_ID = "u-mats";
const COURSE_ID = "c-french";
const COURSE_NAME = "French";

const SEED_CARDS = [
  {
    id: "card-1",
    course_id: COURSE_ID,
    question: "What is a dog?",
    answer: "le chien",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00Z",
    created_at: "2026-04-22T09:00:00Z",
  },
  {
    id: "card-2",
    course_id: COURSE_ID,
    question: "What is a cat?",
    answer: "le chat",
    distractors: [],
    hint: null,
    source: "manual",
    sm2_ease: 2.5,
    sm2_interval: 0,
    sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00Z",
    created_at: "2026-04-22T09:00:00Z",
  },
];

function setup({
  fetchCards,
  createCard,
  updateCard,
  deleteCard,
  bulkDeleteCards,
  reverseCards,
  confirmFn,
  lang = "en",
  currentUser = { id: OWNER_ID, name: "Lex", isAdmin: false },
  courseId = COURSE_ID,
  courseName = COURSE_NAME,
  ownerId = OWNER_ID,
  courseLang = null,
  questionLangDefault = null,
  answerLangDefault = null,
  tts,
} = {}) {
  return render(
    <AppProvider initialLang={lang} initialUser={currentUser} tts={tts}>
      <MemoryRouter
        initialEntries={[
          { pathname: `/courses/${courseId}/cards`, state: { courseName, ownerId, courseLang, questionLangDefault, answerLangDefault } },
        ]}
      >
        <Routes>
          <Route
            path="/courses/:courseId/cards"
            element={
              <CardManager
                fetchCards={fetchCards ?? vi.fn().mockResolvedValue(SEED_CARDS)}
                createCard={createCard ?? vi.fn()}
                updateCard={updateCard ?? vi.fn()}
                deleteCard={deleteCard ?? vi.fn()}
                bulkDeleteCards={bulkDeleteCards ?? vi.fn().mockResolvedValue({ deleted: 0 })}
                reverseCards={reverseCards ?? vi.fn().mockResolvedValue({ created: 0, skipped: 0 })}
                confirmFn={confirmFn ?? vi.fn(() => false)}
              />
            }
          />
          <Route path="/courses" element={<h1>Courses</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("CardManager", () => {
  it("CM1: shows loading indicator before cards are fetched", () => {
    setup({ fetchCards: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading cards/i)).toBeInTheDocument();
  });

  it("CM2: renders list of cards with question and answer", async () => {
    setup();
    expect(await screen.findByText("What is a dog?")).toBeInTheDocument();
    expect(screen.getByText("le chien")).toBeInTheDocument();
    expect(screen.getByText("What is a cat?")).toBeInTheDocument();
  });

  it("CM3: owner sees edit and delete buttons for each card", async () => {
    setup({ currentUser: { id: OWNER_ID, name: "Lex", isAdmin: false } });
    await screen.findByText("What is a dog?");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(2);
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
  });

  it("CM4: non-owner does not see edit or delete buttons", async () => {
    setup({ currentUser: { id: OTHER_ID, name: "Mats", isAdmin: false } });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("CM5: admin sees edit and delete buttons for another user's course", async () => {
    setup({ currentUser: { id: "u-waldo", name: "Waldo", isAdmin: true } });
    await screen.findByText("What is a dog?");
    expect(screen.getAllByRole("button", { name: /edit/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("CM6: empty state shown when course has no cards", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/no cards yet/i)).toBeInTheDocument();
  });

  it("CM7: submitting add form calls createCard and appends card to list", async () => {
    const newCard = {
      id: "card-3",
      course_id: COURSE_ID,
      question: "What is a horse?",
      answer: "le cheval",
      distractors: [],
      hint: null,
      source: "manual",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
    };
    const createCard = vi.fn().mockResolvedValue(newCard);
    const user = userEvent.setup();
    setup({ createCard });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /new card/i }));

    await user.type(screen.getByRole("textbox", { name: /question/i }), "What is a horse?");
    await user.type(screen.getByRole("textbox", { name: /answer/i }), "le cheval");
    await user.click(screen.getByRole("button", { name: /add card/i }));

    expect(createCard).toHaveBeenCalledWith(
      expect.objectContaining({ question: "What is a horse?", answer: "le cheval" }),
    );
    expect(await screen.findByText("What is a horse?")).toBeInTheDocument();
  });

  it("CM8: inline edit saves updated card and reflects change in list", async () => {
    const updatedCard = { ...SEED_CARDS[0], question: "What is a big dog?" };
    const updateCard = vi.fn().mockResolvedValue(updatedCard);
    const user = userEvent.setup();
    setup({ updateCard });

    await screen.findByText("What is a dog?");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    const questionInput = screen.getByRole("textbox", { name: /question/i });
    await user.clear(questionInput);
    await user.type(questionInput, "What is a big dog?");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCard).toHaveBeenCalledWith(
      "card-1",
      COURSE_ID,
      expect.objectContaining({ question: "What is a big dog?" }),
    );
    expect(await screen.findByText("What is a big dog?")).toBeInTheDocument();
  });

  it("CM9: confirming delete calls deleteCard and removes card from list", async () => {
    const deleteCard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup({ deleteCard, confirmFn: vi.fn(() => true) });

    await screen.findByText("What is a dog?");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    expect(deleteCard).toHaveBeenCalledWith("card-1", COURSE_ID);
    await screen.findByText("What is a cat?");
    expect(screen.queryByText("What is a dog?")).toBeNull();
  });

  it("CM10: declined delete does not remove card", async () => {
    const deleteCard = vi.fn();
    const user = userEvent.setup();
    setup({ deleteCard, confirmFn: vi.fn(() => false) });

    await screen.findByText("What is a dog?");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    expect(deleteCard).not.toHaveBeenCalled();
    expect(screen.getByText("What is a dog?")).toBeInTheDocument();
  });

  it("CM11: 403 from updateCard shows forbidden error message", async () => {
    const updateCard = vi.fn().mockRejectedValue(new Error("forbidden"));
    const user = userEvent.setup();
    setup({ updateCard });

    await screen.findByText("What is a dog?");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CM11b: cancel edit restores card row to read-only view", async () => {
    const user = userEvent.setup();
    setup();

    await screen.findByText("What is a dog?");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    expect(screen.getByRole("textbox", { name: /question/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("textbox", { name: /question/i })).toBeNull();
    expect(screen.getByText("What is a dog?")).toBeInTheDocument();
  });

  it("CM11c: fetch error shows generic error message", async () => {
    setup({ fetchCards: vi.fn().mockRejectedValue(new Error("network")) });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CM-BULK1: groups cards by upload_id with manual cards under Manual", async () => {
    const grouped = [
      { ...SEED_CARDS[0], upload_id: null },
      { ...SEED_CARDS[1], upload_id: "upl-A", source: "ai_import" },
      {
        id: "card-3",
        course_id: COURSE_ID,
        question: "What is a horse?",
        answer: "le cheval",
        distractors: [],
        hint: null,
        source: "ai_import",
        sm2_ease: 2.5,
        sm2_interval: 0,
        sm2_reps: 0,
        next_review_at: "2026-04-22T09:00:00Z",
        created_at: "2026-04-22T09:00:00Z",
        upload_id: "upl-A",
      },
    ];
    setup({ fetchCards: vi.fn().mockResolvedValue(grouped) });
    expect(await screen.findByText(/manual cards/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload — .* \(2 cards\)/i)).toBeInTheDocument();
  });

  it("CM-BULK2: shows Delete this upload only on non-manual groups", async () => {
    const grouped = [
      { ...SEED_CARDS[0], upload_id: null },
      { ...SEED_CARDS[1], upload_id: "upl-A", source: "ai_import" },
    ];
    setup({ fetchCards: vi.fn().mockResolvedValue(grouped) });
    await screen.findByText(/manual cards/i);
    const buttons = screen.getAllByRole("button", { name: /delete this upload/i });
    expect(buttons.length).toBe(1); // only on the upl-A group
  });

  it("CM-BULK3: confirming Delete this upload calls bulkDeleteCards with uploadId", async () => {
    const grouped = [
      { ...SEED_CARDS[1], upload_id: "upl-A", source: "ai_import" },
    ];
    const bulkDeleteCards = vi.fn().mockResolvedValue({ deleted: 1 });
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(grouped),
      bulkDeleteCards,
      confirmFn: vi.fn(() => true),
    });

    await screen.findByText(/upload — /i);
    await user.click(screen.getByRole("button", { name: /delete this upload/i }));

    expect(bulkDeleteCards).toHaveBeenCalledWith({ courseId: COURSE_ID, uploadId: "upl-A" });
    // group disappears from UI
    expect(screen.queryByText(/upload — /i)).toBeNull();
  });

  it("CM-BULK4: Delete selected calls bulkDeleteCards with checked ids", async () => {
    const bulkDeleteCards = vi.fn().mockResolvedValue({ deleted: 1 });
    const user = userEvent.setup();
    setup({ bulkDeleteCards, confirmFn: vi.fn(() => true) });

    await screen.findByText("What is a dog?");
    const checkboxes = screen.getAllByRole("checkbox", { name: /select card/i });
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: /delete selected/i }));

    expect(bulkDeleteCards).toHaveBeenCalledWith({ courseId: COURSE_ID, ids: ["card-1"] });
  });

  it("CM-BULK5: Delete all confirms then calls bulkDeleteCards with all=true", async () => {
    const bulkDeleteCards = vi.fn().mockResolvedValue({ deleted: 2 });
    const user = userEvent.setup();
    setup({ bulkDeleteCards, confirmFn: vi.fn(() => true) });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /delete all cards/i }));

    expect(bulkDeleteCards).toHaveBeenCalledWith({ courseId: COURSE_ID, all: true });
  });

  it("CM-BULK6: non-owner / non-admin sees no bulk-delete UI", async () => {
    const grouped = [
      { ...SEED_CARDS[0], upload_id: "upl-A", source: "ai_import" },
    ];
    setup({
      currentUser: { id: OTHER_ID, name: "Mats", isAdmin: false },
      fetchCards: vi.fn().mockResolvedValue(grouped),
    });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /delete this upload/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete all cards/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete selected/i })).toBeNull();
  });

  it("CM-BULK7: bulk-delete API failure shows error and leaves list intact", async () => {
    const grouped = [
      { ...SEED_CARDS[0], upload_id: "upl-A", source: "ai_import" },
    ];
    const bulkDeleteCards = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(grouped),
      bulkDeleteCards,
      confirmFn: vi.fn(() => true),
    });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /delete this upload/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("What is a dog?")).toBeInTheDocument();
  });

  it("CM-BULK8: declined confirm on Delete all does nothing", async () => {
    const bulkDeleteCards = vi.fn();
    const user = userEvent.setup();
    setup({ bulkDeleteCards, confirmFn: vi.fn(() => false) });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /delete all cards/i }));

    expect(bulkDeleteCards).not.toHaveBeenCalled();
  });

  it("CM12: back link navigates to /courses", async () => {
    setup();
    await screen.findByText("What is a dog?");
    const backLink = screen.getByRole("link", { name: /back/i });
    expect(backLink).toHaveAttribute("href", "/courses");
  });
});

describe("CardManager — Reverse cards", () => {
  it("shows 'Add reverse cards' button for course owner", async () => {
    setup();
    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /add reverse cards/i })).toBeInTheDocument();
  });

  it("hides 'Add reverse cards' for read-only viewer", async () => {
    setup({ currentUser: { id: OTHER_ID, name: "Mats", isAdmin: false } });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /add reverse cards/i })).toBeNull();
  });

  it("clicking 'Add reverse cards' calls the API, refreshes, shows status", async () => {
    const reverseCards = vi.fn().mockResolvedValue({ created: 2, skipped: 0 });
    const refreshedCards = [
      ...SEED_CARDS,
      { ...SEED_CARDS[0], id: "rev-1", question: "le chien", answer: "What is a dog?", reverse_of: "card-1" },
      { ...SEED_CARDS[1], id: "rev-2", question: "le chat", answer: "What is a cat?", reverse_of: "card-2" },
    ];
    const fetchCards = vi.fn()
      .mockResolvedValueOnce(SEED_CARDS)
      .mockResolvedValueOnce(refreshedCards);
    const user = userEvent.setup();
    setup({ fetchCards, reverseCards });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /add reverse cards/i }));

    expect(reverseCards).toHaveBeenCalledWith({ courseId: COURSE_ID });
    expect(await screen.findByText(/added 2 reverse cards/i)).toBeInTheDocument();
  });

  it("shows 'all reversed' status when created=0", async () => {
    const reverseCards = vi.fn().mockResolvedValue({ created: 0, skipped: 2 });
    const user = userEvent.setup();
    setup({ reverseCards });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /add reverse cards/i }));

    expect(await screen.findByText(/all cards already have reverses/i)).toBeInTheDocument();
  });

  it("shows error when reverse API fails", async () => {
    const reverseCards = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    setup({ reverseCards });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /add reverse cards/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("CardManager — TTS speak buttons", () => {
  const defaultFetch = vi.fn().mockResolvedValue(SEED_CARDS);

  it("shows 🔊 buttons when courseLang set and tts available (AC7)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    expect(speakBtns.length).toBeGreaterThanOrEqual(2);
  });

  it("hides 🔊 buttons when no courseLang (AC8)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: null, tts });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /Speak/i })).toBeNull();
  });

  it("clicking 🔊 on a card question calls tts.speak (AC9)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    await userEvent.click(speakBtns[0]);
    expect(tts.lastSpoken?.lang).toBe("fr-FR");
    expect(tts.lastSpoken?.text).toBeTruthy();
  });

  it("speak button uses card.question_lang for question and card.answer_lang for answer (AC10)", async () => {
    const cardsWithLang = [
      {
        ...SEED_CARDS[0],
        question: "the dog",
        answer: "le chien",
        question_lang: "en",
        answer_lang: "fr-FR",
      },
    ];
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: vi.fn().mockResolvedValue(cardsWithLang), courseLang: "fr-FR", tts });
    await screen.findByText("the dog");
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    // First speak button is on the question column
    await userEvent.click(speakBtns[0]);
    expect(tts.lastSpoken).toMatchObject({ text: "the dog", lang: "en" });
    // Second speak button is on the answer column
    await userEvent.click(speakBtns[1]);
    expect(tts.lastSpoken).toMatchObject({ text: "le chien", lang: "fr-FR" });
  });

  it("speak button falls back to courseLang when per-side lang is null (AC10b)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    await userEvent.click(speakBtns[0]);
    expect(tts.lastSpoken?.lang).toBe("fr-FR");
  });

  it("speak button uses course-level lang defaults when card has no per-side lang", async () => {
    const tts = createFakeTts({ available: true });
    setup({
      fetchCards: defaultFetch,
      courseLang: "fr-FR",
      questionLangDefault: "fr",
      answerLangDefault: "nl",
      tts,
    });
    await screen.findByText("What is a dog?");
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    // Question: card has no question_lang → falls back to questionLangDefault "fr"
    await userEvent.click(speakBtns[0]);
    expect(tts.lastSpoken?.lang).toBe("fr");
    // Answer: card has no answer_lang → falls back to answerLangDefault "nl"
    await userEvent.click(speakBtns[1]);
    expect(tts.lastSpoken?.lang).toBe("nl");
  });
});
