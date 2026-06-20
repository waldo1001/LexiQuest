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
  copyUploadCards,
  renameUpload,
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
                copyUploadCards={copyUploadCards ?? vi.fn().mockResolvedValue({ copied: 0, skipped: 0, copied_card_ids: [] })}
                renameUpload={renameUpload ?? vi.fn().mockResolvedValue({ updated: 0 })}
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

  it("CM11d: swap button on card row calls updateCard with question and answer reversed", async () => {
    const swapped = { ...SEED_CARDS[0], question: "le chien", answer: "What is a dog?" };
    const updateCard = vi.fn().mockResolvedValue(swapped);
    const user = userEvent.setup();
    setup({ updateCard });

    await screen.findByText("What is a dog?");
    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    await user.click(swapButtons[0]);

    expect(updateCard).toHaveBeenCalledWith(
      "card-1",
      COURSE_ID,
      expect.objectContaining({ question: "le chien", answer: "What is a dog?" }),
    );
    expect(await screen.findByText("le chien")).toBeInTheDocument();
  });

  it("CM11f: swap button inside edit form swaps the input field values without saving", async () => {
    const user = userEvent.setup();
    setup();

    await screen.findByText("What is a dog?");
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    expect(screen.getByRole("textbox", { name: /question/i })).toHaveValue("What is a dog?");
    expect(screen.getByRole("textbox", { name: /answer/i })).toHaveValue("le chien");

    // card-1 is in edit mode; DOM order is [edit-form swap, card-2 read-only swap]
    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    await user.click(swapButtons[0]);

    expect(screen.getByRole("textbox", { name: /question/i })).toHaveValue("le chien");
    expect(screen.getByRole("textbox", { name: /answer/i })).toHaveValue("What is a dog?");
  });

  it("CM11e: swap button in new card form swaps question and answer fields", async () => {
    const user = userEvent.setup();
    setup();

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /new card/i }));

    await user.type(screen.getByRole("textbox", { name: /question/i }), "Hello");
    await user.type(screen.getByRole("textbox", { name: /answer/i }), "Bonjour");

    // two card rows each have a 🔄, plus the new-card form — click the last one
    const swapButtons = screen.getAllByRole("button", { name: /swap question and answer/i });
    await user.click(swapButtons[swapButtons.length - 1]);

    expect(screen.getByRole("textbox", { name: /question/i })).toHaveValue("Bonjour");
    expect(screen.getByRole("textbox", { name: /answer/i })).toHaveValue("Hello");
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
    const buttons = screen.getAllByTitle(/delete this upload/i);
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
    await user.click(screen.getByTitle(/delete this upload/i));

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
    await screen.findByText(/upload — /i);
    expect(screen.queryByTitle(/delete this upload/i)).toBeNull();
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

    await screen.findByText(/upload — /i);
    await user.click(screen.getByTitle(/delete this upload/i));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Group header still present (cards not removed due to error)
    expect(screen.getByText(/upload — /i)).toBeInTheDocument();
  });

  it("CM-BULK8: declined confirm on Delete all does nothing", async () => {
    const bulkDeleteCards = vi.fn();
    const user = userEvent.setup();
    setup({ bulkDeleteCards, confirmFn: vi.fn(() => false) });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /delete all cards/i }));

    expect(bulkDeleteCards).not.toHaveBeenCalled();
  });

  it("CM-UPLOAD: shows 'Upload stats' link when uploads exist", async () => {
    const grouped = [
      { ...SEED_CARDS[0], upload_id: "upl-A", source: "ai_import" },
    ];
    setup({ fetchCards: vi.fn().mockResolvedValue(grouped) });
    await screen.findByText(/upload — /i);
    const link = screen.getByTestId("upload-stats-link");
    expect(link).toHaveAttribute("href", `/stats/course/${COURSE_ID}/uploads`);
  });

  it("CM-UPLOAD-NONE: hides 'Upload stats' link when no uploads", async () => {
    setup();
    await screen.findByText("What is a dog?");
    expect(screen.queryByTestId("upload-stats-link")).toBeNull();
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

describe("CardManager — Pairing UI + linked delete", () => {
  const PAIRED_CARDS = [
    {
      id: "card-fwd",
      course_id: COURSE_ID,
      question: "the dog",
      answer: "le chien",
      distractors: [],
      hint: null,
      source: "manual",
      reverse_of: null,
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
    },
    {
      id: "card-rev",
      course_id: COURSE_ID,
      question: "le chien",
      answer: "the dog",
      distractors: [],
      hint: null,
      source: "reverse",
      reverse_of: "card-fwd",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
    },
    {
      id: "card-solo",
      course_id: COURSE_ID,
      question: "What is a cat?",
      answer: "le chat",
      distractors: [],
      hint: null,
      source: "manual",
      reverse_of: null,
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
    },
  ];

  it("shows ↔ badge on both forward and reverse cards in a pair", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS) });
    await screen.findAllByText("the dog");
    const badges = screen.getAllByText("↔");
    expect(badges).toHaveLength(2); // forward + reverse, not solo
  });

  it("does not show ↔ badge on standalone cards", async () => {
    const soloOnly = [PAIRED_CARDS[2]]; // just card-solo
    setup({ fetchCards: vi.fn().mockResolvedValue(soloOnly) });
    await screen.findByText("What is a cat?");
    expect(screen.queryByText("↔")).toBeNull();
  });

  it("tooltip on ↔ badge names the partner question", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS) });
    await screen.findAllByText("the dog");
    const badges = screen.getAllByText("↔");
    const titles = badges.map((b) => b.getAttribute("title"));
    // Forward card's badge should reference the reverse card's question
    expect(titles.some((t) => t && t.includes("le chien"))).toBe(true);
    // Reverse card's badge should reference the forward card's question
    expect(titles.some((t) => t && t.includes("the dog"))).toBe(true);
  });

  it("deleting forward with reverse shows second confirm about reverse", async () => {
    const confirmFn = vi.fn()
      .mockReturnValueOnce(true)   // basic confirm
      .mockReturnValueOnce(false); // linked confirm → decline
    const deleteCard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS),
      deleteCard,
      confirmFn,
    });

    await screen.findAllByText("the dog");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]); // forward card

    expect(confirmFn).toHaveBeenCalledTimes(2);
    expect(confirmFn.mock.calls[1][0]).toMatch(/reverse/i);
  });

  it("deleting reverse with forward shows second confirm about forward", async () => {
    const confirmFn = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const deleteCard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS),
      deleteCard,
      confirmFn,
    });

    await screen.findAllByText("the dog");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[1]); // reverse card

    expect(confirmFn).toHaveBeenCalledTimes(2);
    expect(confirmFn.mock.calls[1][0]).toMatch(/forward/i);
  });

  it("confirming linked delete calls deleteCard for both cards", async () => {
    const confirmFn = vi.fn(() => true);
    const deleteCard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS),
      deleteCard,
      confirmFn,
    });

    await screen.findAllByText("the dog");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]); // delete forward

    expect(deleteCard).toHaveBeenCalledTimes(2);
    expect(deleteCard).toHaveBeenCalledWith("card-fwd", COURSE_ID);
    expect(deleteCard).toHaveBeenCalledWith("card-rev", COURSE_ID);
  });

  it("declining linked delete calls deleteCard for chosen only", async () => {
    const confirmFn = vi.fn()
      .mockReturnValueOnce(true)   // basic confirm → yes
      .mockReturnValueOnce(false); // linked confirm → no
    const deleteCard = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup({
      fetchCards: vi.fn().mockResolvedValue(PAIRED_CARDS),
      deleteCard,
      confirmFn,
    });

    await screen.findAllByText("the dog");
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]); // delete forward, decline partner

    expect(deleteCard).toHaveBeenCalledTimes(1);
    expect(deleteCard).toHaveBeenCalledWith("card-fwd", COURSE_ID);
  });
});

describe("CardManager — TTS speak buttons", () => {
  const defaultFetch = vi.fn().mockResolvedValue(SEED_CARDS);

  /** Sound is off by default; click the speaker toggle to turn it on. */
  async function enableSound() {
    await userEvent.click(screen.getByTestId("speech-toggle"));
  }

  it("starts with sound OFF by default — no 🔊 buttons until the speaker is toggled on", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /Speak/i })).toBeNull();
    expect(screen.getByTestId("speech-toggle").className).toContain("off");
    await enableSound();
    expect(screen.getAllByRole("button", { name: /Speak/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows 🔊 buttons when sound enabled, courseLang set and tts available (AC7)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ fetchCards: defaultFetch, courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    await enableSound();
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
    await enableSound();
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
    await screen.findAllByText("the dog");
    await enableSound();
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
    await enableSound();
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
    await enableSound();
    const speakBtns = screen.getAllByRole("button", { name: /Speak/i });
    // Question: card has no question_lang → falls back to questionLangDefault "fr"
    await userEvent.click(speakBtns[0]);
    expect(tts.lastSpoken?.lang).toBe("fr");
    // Answer: card has no answer_lang → falls back to answerLangDefault "nl"
    await userEvent.click(speakBtns[1]);
    expect(tts.lastSpoken?.lang).toBe("nl");
  });
});

// =====================================================================
// Slice A — Manual add into an existing upload
// =====================================================================
describe("CardManager — Add card into existing upload", () => {
  const SEED_WITH_UPLOAD = [
    {
      id: "card-manual",
      course_id: COURSE_ID,
      question: "Manual Q",
      answer: "Manual A",
      distractors: [],
      hint: null,
      source: "manual",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
      upload_id: null,
      upload_name: null,
    },
    {
      id: "card-up1-a",
      course_id: COURSE_ID,
      question: "Imported Q1",
      answer: "Imported A1",
      distractors: [],
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
      upload_id: "up-1",
      upload_name: "Math homework",
    },
    {
      id: "card-up1-b",
      course_id: COURSE_ID,
      question: "Imported Q2",
      answer: "Imported A2",
      distractors: [],
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
      upload_id: "up-1",
      upload_name: "Math homework",
    },
  ];

  it("CMA-1: New-card form shows 'Add to' selector listing Manual + each existing upload", async () => {
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD) });

    await screen.findByText(/Math homework \(2\)/);
    await user.click(screen.getByRole("button", { name: /new card/i }));

    const select = screen.getByRole("combobox", { name: /add to/i });
    expect(select).toBeInTheDocument();
    // Default = Manual
    expect(select).toHaveValue("");
    // Has Manual + Math homework as options
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Manual cards");
    expect(optionLabels.some((l) => l.includes("Math homework"))).toBe(true);
  });

  it("CMA-2: submitting with Manual selected sends no upload_id", async () => {
    const created = {
      ...SEED_WITH_UPLOAD[0],
      id: "card-new",
      question: "Q new",
      answer: "A new",
    };
    const createCard = vi.fn().mockResolvedValue(created);
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD), createCard });

    await screen.findByText(/Math homework \(2\)/);
    await user.click(screen.getByRole("button", { name: /new card/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Q new");
    await user.type(screen.getByRole("textbox", { name: /answer/i }), "A new");
    await user.click(screen.getByRole("button", { name: /add card/i }));

    expect(createCard).toHaveBeenCalledTimes(1);
    const payload = createCard.mock.calls[0][0];
    expect(payload.upload_id == null).toBe(true);
  });

  it("CMA-3: submitting with an upload selected sends that upload_id", async () => {
    const created = {
      ...SEED_WITH_UPLOAD[1],
      id: "card-new",
      question: "Q new",
      answer: "A new",
    };
    const createCard = vi.fn().mockResolvedValue(created);
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD), createCard });

    await screen.findByText(/Math homework \(2\)/);
    await user.click(screen.getByRole("button", { name: /new card/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /add to/i }), "up-1");
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Q new");
    await user.type(screen.getByRole("textbox", { name: /answer/i }), "A new");
    await user.click(screen.getByRole("button", { name: /add card/i }));

    expect(createCard).toHaveBeenCalledTimes(1);
    expect(createCard.mock.calls[0][0]).toEqual(
      expect.objectContaining({ upload_id: "up-1" }),
    );
  });

  it("CMA-4: per-upload 'Add card here' button opens form pre-targeted to that upload", async () => {
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD) });

    await screen.findByText(/Math homework \(2\)/);
    const addHere = await screen.findByTestId("upload-add-card-up-1");
    await user.click(addHere);

    const select = screen.getByRole("combobox", { name: /add to/i });
    expect(select).toHaveValue("up-1");
  });

  it("CMA-5: after manual-add to an upload, the new card appears under that group", async () => {
    const created = {
      ...SEED_WITH_UPLOAD[1],
      id: "card-new",
      question: "Q new",
      answer: "A new",
      upload_id: "up-1",
      upload_name: "Math homework",
    };
    const createCard = vi.fn().mockResolvedValue(created);
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD), createCard });

    await screen.findByText(/Math homework \(2\)/);
    await user.click(screen.getByRole("button", { name: /new card/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /add to/i }), "up-1");
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Q new");
    await user.type(screen.getByRole("textbox", { name: /answer/i }), "A new");
    await user.click(screen.getByRole("button", { name: /add card/i }));

    // The new card should appear and the Math homework group's count should reflect 3.
    expect(await screen.findByText("Q new")).toBeInTheDocument();
    expect(screen.getByText(/Math homework \(3\)/)).toBeInTheDocument();
  });

  it("CMA-6: when no uploads exist, selector is hidden (no regression for fresh course)", async () => {
    const user = userEvent.setup();
    // Only manual-only cards (no upload_id)
    setup();
    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: /new card/i }));

    expect(screen.queryByRole("combobox", { name: /add to/i })).toBeNull();
  });

  it("CMA-7 (Slice B): per-upload 'Import here' link points at /import with the upload preselected", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_WITH_UPLOAD) });
    await screen.findByText(/Math homework \(2\)/);

    const link = await screen.findByTestId("upload-import-here-up-1");
    // The link is an anchor pointing at the import route. We can't read
    // navigation state directly from href, but the testid plus a stable
    // href is enough to verify the affordance exists; PI-B2 covers
    // pre-selection inside PhotoImport.
    expect(link).toHaveAttribute("href", expect.stringContaining(`/courses/${COURSE_ID}/import`));
  });
});

// =====================================================================
// Copy upload cards
// =====================================================================
describe("CardManager — Copy upload cards", () => {
  const SEED_TWO_UPLOADS = [
    {
      id: "card-up1-a",
      course_id: COURSE_ID,
      question: "Q1A",
      answer: "A1A",
      distractors: [],
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
      upload_id: "up-1",
      upload_name: "Math homework",
    },
    {
      id: "card-up1-b",
      course_id: COURSE_ID,
      question: "Q1B",
      answer: "A1B",
      distractors: [],
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
      created_at: "2026-04-22T09:00:00Z",
      upload_id: "up-1",
      upload_name: "Math homework",
    },
    {
      id: "card-up2-a",
      course_id: COURSE_ID,
      question: "Q2A",
      answer: "A2A",
      distractors: [],
      hint: null,
      source: "ai_import",
      sm2_ease: 2.5,
      sm2_interval: 0,
      sm2_reps: 0,
      next_review_at: "2026-04-23T09:00:00Z",
      created_at: "2026-04-23T09:00:00Z",
      upload_id: "up-2",
      upload_name: "Science homework",
    },
  ];

  const SEED_ONE_UPLOAD = SEED_TWO_UPLOADS.filter((c) => c.upload_id === "up-1");

  it("CC-1: 📋 copy button is rendered on each non-manual upload group", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS) });
    await screen.findByText(/Math homework \(2\)/);
    expect(await screen.findByTestId("upload-copy-up-1")).toBeInTheDocument();
    expect(await screen.findByTestId("upload-copy-up-2")).toBeInTheDocument();
  });

  it("CC-2: copy button is disabled when only one upload exists in the course", async () => {
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_ONE_UPLOAD) });
    await screen.findByText(/Math homework \(2\)/);
    const btn = await screen.findByTestId("upload-copy-up-1");
    expect(btn).toBeDisabled();
  });

  it("CC-3: clicking the copy button reveals a target select with other uploads only (excludes self + manual)", async () => {
    const user = userEvent.setup();
    setup({ fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS) });
    await screen.findByText(/Math homework \(2\)/);
    const btn = await screen.findByTestId("upload-copy-up-1");
    await user.click(btn);

    const select = await screen.findByRole("combobox", { name: /copy to upload/i });
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels.some((l) => l.includes("Science homework"))).toBe(true);
    // Self (Math homework) must NOT appear
    expect(labels.some((l) => l.includes("Math homework"))).toBe(false);
    // Manual cards must NOT appear (it's not an upload — there are no manual cards here anyway, but ensure no trailing manual entry)
    expect(labels.some((l) => l === "Manual cards")).toBe(false);
  });

  it("CC-4: confirming the copy calls copyUploadCards with the right ids", async () => {
    const user = userEvent.setup();
    const copyMock = vi.fn().mockResolvedValue({ copied: 1, skipped: 0, copied_card_ids: ["new-1"] });
    setup({
      fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS),
      copyUploadCards: copyMock,
    });
    await screen.findByText(/Math homework \(2\)/);
    await user.click(await screen.findByTestId("upload-copy-up-1"));
    await user.selectOptions(screen.getByRole("combobox", { name: /copy to upload/i }), "up-2");
    await user.click(screen.getByRole("button", { name: /^Copy$/i }));

    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      sourceUploadId: "up-1",
      targetUploadId: "up-2",
    });
  });

  it("CC-5: after a successful copy, status shows '{copied} copied, {skipped} skipped' and cards refetch", async () => {
    const user = userEvent.setup();
    const fetchCardsMock = vi
      .fn()
      .mockResolvedValueOnce(SEED_TWO_UPLOADS)
      .mockResolvedValueOnce([
        ...SEED_TWO_UPLOADS,
        {
          id: "card-up2-copy",
          course_id: COURSE_ID,
          question: "Q1A",
          answer: "A1A",
          distractors: [],
          hint: null,
          source: "ai_import",
          sm2_ease: 2.5,
          sm2_interval: 0,
          sm2_reps: 0,
          next_review_at: "2026-04-30T09:00:00Z",
          created_at: "2026-04-30T09:00:00Z",
          upload_id: "up-2",
          upload_name: "Science homework",
        },
      ]);
    const copyMock = vi.fn().mockResolvedValue({ copied: 1, skipped: 1, copied_card_ids: ["card-up2-copy"] });
    setup({ fetchCards: fetchCardsMock, copyUploadCards: copyMock });

    await screen.findByText(/Math homework \(2\)/);
    await user.click(await screen.findByTestId("upload-copy-up-1"));
    await user.selectOptions(screen.getByRole("combobox", { name: /copy to upload/i }), "up-2");
    await user.click(screen.getByRole("button", { name: /^Copy$/i }));

    expect(await screen.findByText(/1 copied, 1 skipped/i)).toBeInTheDocument();
    // Refetch happened (twice: initial + after copy)
    expect(fetchCardsMock).toHaveBeenCalledTimes(2);
    // Science homework now has 2 cards
    expect(await screen.findByText(/Science homework \(2\)/)).toBeInTheDocument();
  });

  it("CC-6: a 403 response shows the standard forbidden error", async () => {
    const user = userEvent.setup();
    const copyMock = vi.fn().mockRejectedValue(new Error("forbidden"));
    setup({
      fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS),
      copyUploadCards: copyMock,
    });
    await screen.findByText(/Math homework \(2\)/);
    await user.click(await screen.findByTestId("upload-copy-up-1"));
    await user.selectOptions(screen.getByRole("combobox", { name: /copy to upload/i }), "up-2");
    await user.click(screen.getByRole("button", { name: /^Copy$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/i);
  });

  it("CR-1: clicking ✏️ opens the rename row, saving calls renameUpload and updates the visible label", async () => {
    const user = userEvent.setup();
    const renameMock = vi.fn().mockResolvedValue({ updated: 2 });
    setup({
      fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS),
      renameUpload: renameMock,
    });
    await screen.findByText(/Math homework \(2\)/);
    // The rename buttons share data-testid="rename-btn" — pick the first (up-1)
    const renameBtns = screen.getAllByTestId("rename-btn");
    await user.click(renameBtns[0]);

    const input = await screen.findByTestId("rename-input");
    await user.clear(input);
    await user.type(input, "Algebra unit");
    await user.keyboard("{Enter}");

    expect(renameMock).toHaveBeenCalledTimes(1);
    // Groups render newest-first (Science homework before Math homework),
    // so renameBtns[0] targets up-2 (Science homework).
    expect(renameMock).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      uploadId: "up-2",
      uploadName: "Algebra unit",
    });
    expect(await screen.findByText(/Algebra unit \(1\)/)).toBeInTheDocument();
  });

  it("CR-2: rename Cancel closes the row without calling renameUpload", async () => {
    const user = userEvent.setup();
    const renameMock = vi.fn();
    setup({
      fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS),
      renameUpload: renameMock,
    });
    await screen.findByText(/Math homework \(2\)/);
    const renameBtns = screen.getAllByTestId("rename-btn");
    await user.click(renameBtns[0]);
    expect(await screen.findByTestId("rename-input")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByTestId("rename-input")).toBeNull();
    expect(renameMock).not.toHaveBeenCalled();
  });

  it("CC-7: cancel closes the copy-row without calling the API", async () => {
    const user = userEvent.setup();
    const copyMock = vi.fn();
    setup({
      fetchCards: vi.fn().mockResolvedValue(SEED_TWO_UPLOADS),
      copyUploadCards: copyMock,
    });
    await screen.findByText(/Math homework \(2\)/);
    await user.click(await screen.findByTestId("upload-copy-up-1"));
    expect(screen.getByRole("combobox", { name: /copy to upload/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByRole("combobox", { name: /copy to upload/i })).toBeNull();
    expect(copyMock).not.toHaveBeenCalled();
  });
});
