import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StudySession from "./StudySession.jsx";
import { AppProvider } from "../context/AppContext.jsx";
import { createFakeTts } from "../testing/fake-tts.js";

function ResultsStub() {
  const { state } = useLocation();
  return (
    <div>
      <h1>Results</h1>
      <span data-testid="rs-studied">{state?.cards_studied ?? "?"}</span>
      <span data-testid="rs-correct">{state?.cards_correct ?? "?"}</span>
      <span data-testid="rs-duration">{state?.duration_seconds ?? "?"}</span>
      <span data-testid="rs-xp">{state?.xp_earned ?? "?"}</span>
    </div>
  );
}

const CARDS_WITH_DISTRACTORS = [
  {
    id: "card-1",
    course_id: "c-french",
    question: "What is a dog?",
    answer: "le chien",
    distractors: ["le chat", "le cheval"],
    sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00Z",
  },
];

const COURSE_ID = "c-french";
const SESSION_ID = "sess-1";

const CARDS = [
  {
    id: "card-1",
    course_id: COURSE_ID,
    question: "What is a dog?",
    answer: "le chien",
    sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00Z",
  },
  {
    id: "card-2",
    course_id: COURSE_ID,
    question: "What is a cat?",
    answer: "le chat",
    sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0,
    next_review_at: "2026-04-22T09:00:00Z",
  },
];

function setup({
  startSession,
  postAttempts,
  closeSession,
  courseId = COURSE_ID,
  courseName = "French",
  mode = "self_grade",
  courseLang = null,
  questionLangDefault = null,
  answerLangDefault = null,
  gameType = "classic",
  cardLimit = null,
  cardOrder = "hardest_first",
  lang = "en",
  currentUser = { id: "u-lex", name: "Lex", is_admin: false },
  tts,
  shuffleFn,
} = {}) {
  const defaultStart = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
  const defaultAttempts = vi.fn().mockResolvedValue({ logged: 2 });
  const defaultClose = vi.fn().mockResolvedValue({ ended_at: "2026-04-22T10:05:00Z" });

  return render(
    <AppProvider initialLang={lang} initialUser={currentUser} tts={tts}>
      <MemoryRouter
        initialEntries={[
          { pathname: `/courses/${courseId}/study`, state: { courseName, mode, courseLang, questionLangDefault, answerLangDefault, gameType, cardLimit, cardOrder } },
        ]}
      >
        <Routes>
          <Route
            path="/courses/:courseId/study"
            element={
              <StudySession
                startSession={startSession ?? defaultStart}
                postAttempts={postAttempts ?? defaultAttempts}
                closeSession={closeSession ?? defaultClose}
                {...(shuffleFn ? { shuffleFn } : {})}
              />
            }
          />
          <Route path="/courses" element={<h1>Courses</h1>} />
          <Route path="/courses/:courseId/results" element={<ResultsStub />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("StudySession — loading state", () => {
  it("shows loading indicator initially", () => {
    const startSession = vi.fn(() => new Promise(() => {}));
    setup({ startSession });
    expect(screen.getByText(/Building your session/i)).toBeTruthy();
  });

  it("calls startSession with courseId and mode from route state", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession });
    await waitFor(() => expect(startSession).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      mode: "self_grade",
    }));
  });
});

describe("StudySession — empty queue", () => {
  it("shows empty message when no cards", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: [] });
    setup({ startSession });
    await screen.findByText(/No cards due/i);
  });
});

describe("StudySession — card flip", () => {
  it("shows first card question", async () => {
    setup();
    await screen.findByText("What is a dog?");
  });

  it("shows 'Show answer' button, not grade buttons, before flip", async () => {
    setup();
    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /Show answer/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Knew it/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Didn't know/i })).toBeNull();
  });

  it("reveals answer and grade buttons after clicking Show answer", async () => {
    setup();
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    expect(screen.getByText("le chien")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Knew it/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Didn't know/i })).toBeTruthy();
  });
});

describe("StudySession — grading", () => {
  it("advances to next card after grading 'Knew it'", async () => {
    setup();
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));
    await screen.findByText("What is a cat?");
  });

  it("shows progress counter", async () => {
    setup();
    await screen.findByText("What is a dog?");
    expect(screen.getByText(/1 \/ 2/i)).toBeTruthy();
  });

  it("wrong card goes to retry pile — card appears again after queue drains", async () => {
    setup();
    await screen.findByText("What is a dog?");
    // Grade card-1 wrong
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Didn't know/i }));
    // card-2 is next
    await screen.findByText("What is a cat?");
    // Grade card-2 correct
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));
    // card-1 should reappear from retry pile
    await screen.findByText("What is a dog?");
  });
});

describe("StudySession — session completion", () => {
  it("calls postAttempts and closeSession on completion, then navigates to results with stats", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 2 });
    const closeSession = vi.fn().mockResolvedValue({
      ended_at: "2026-04-22T10:05:00Z",
      cards_studied: 2,
      cards_correct: 2,
      duration_seconds: 45,
      xp_earned: 30,
    });
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    // Grade card-1 correct
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));
    // Grade card-2 correct
    await screen.findByText("What is a cat?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));

    await waitFor(() => {
      expect(postAttempts).toHaveBeenCalledOnce();
      expect(closeSession).toHaveBeenCalledOnce();
    });

    const attemptCall = postAttempts.mock.calls[0][0];
    expect(attemptCall.sessionId).toBe(SESSION_ID);
    expect(attemptCall.items).toHaveLength(2);
    expect(attemptCall.items[0].correct).toBe(true);

    await screen.findByText("Results");
    // Stats from closeSession response are forwarded to results screen
    expect(screen.getByTestId("rs-studied")).toHaveTextContent("2");
    expect(screen.getByTestId("rs-correct")).toHaveTextContent("2");
    expect(screen.getByTestId("rs-duration")).toHaveTextContent("45");
    expect(screen.getByTestId("rs-xp")).toHaveTextContent("30");
  });

  it("cards_correct count excludes retry attempts", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 3 });
    const closeSession = vi.fn().mockResolvedValue({});
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    // card-1 wrong → goes to retry pile
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Didn't know/i }));
    // card-2 correct
    await screen.findByText("What is a cat?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));
    // card-1 retry — correct
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Knew it/i }));

    await waitFor(() => expect(closeSession).toHaveBeenCalledOnce());
    const closeCall = closeSession.mock.calls[0][1];
    // cards_studied = 2 (unique cards), cards_correct = 1 (card-1 failed first try)
    expect(closeCall.cards_studied).toBe(2);
    expect(closeCall.cards_correct).toBe(1);
  });
});

describe("StudySession — TTS speak buttons", () => {
  it("shows 🔊 on question when courseLang set and tts available (AC1)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /Speak question/i })).toBeTruthy();
  });

  it("hides 🔊 when no courseLang (AC2)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ courseLang: null, tts });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /Speak question/i })).toBeNull();
  });

  it("hides 🔊 when tts.isAvailable returns false (AC3)", async () => {
    const tts = createFakeTts({ available: false });
    setup({ courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /Speak question/i })).toBeNull();
  });

  it("clicking 🔊 on question calls tts.speak with question text and lang (AC4)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Speak question/i }));
    expect(tts.lastSpoken).toMatchObject({ text: "What is a dog?", lang: "fr-FR" });
  });

  it("shows 🔊 on answer after reveal (AC5)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    expect(screen.getByRole("button", { name: /Speak answer/i })).toBeTruthy();
  });

  it("clicking 🔊 on answer calls tts.speak with answer text (AC6)", async () => {
    const tts = createFakeTts({ available: true });
    setup({ courseLang: "fr-FR", tts });
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Speak answer/i }));
    expect(tts.lastSpoken).toMatchObject({ text: "le chien", lang: "fr-FR" });
  });
});

describe("StudySession — auto_speak", () => {
  it("auto-speaks question when auto_speak true and canSpeak (AC4)", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: true } };
    setup({ courseLang: "fr-FR", tts, currentUser: user });
    await screen.findByText("What is a dog?");
    expect(tts.spokenItems.some((s) => s.text === "What is a dog?" && s.lang === "fr-FR")).toBe(true);
  });

  it("auto-speaks answer on reveal when auto_speak true (AC5)", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: true } };
    setup({ courseLang: "fr-FR", tts, currentUser: user });
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    expect(tts.spokenItems.some((s) => s.text === "le chien")).toBe(true);
  });

  it("does not auto-speak when auto_speak false (AC6)", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: false } };
    setup({ courseLang: "fr-FR", tts, currentUser: user });
    await screen.findByText("What is a dog?");
    expect(tts.spokenItems).toHaveLength(0);
  });
});

describe("StudySession — MCQ mode", () => {
  function setupMcq(overrides = {}) {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_DISTRACTORS });
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "2026-04-22T10:05:00Z" });
    return setup({
      startSession,
      postAttempts,
      closeSession,
      mode: "mcq",
      shuffleFn: (arr) => arr, // deterministic: [answer, d1, d2]
      ...overrides,
    });
  }

  it("MCQ1: shows 3 choice buttons in question phase (no Show answer)", async () => {
    setupMcq();
    await screen.findByText("What is a dog?");
    // Should NOT show "Show answer" button
    expect(screen.queryByRole("button", { name: /show answer/i })).toBeNull();
    // Should show 3 choice buttons
    const buttons = screen.getAllByRole("button");
    const choiceButtons = buttons.filter((b) =>
      ["le chien", "le chat", "le cheval"].includes(b.textContent ?? ""),
    );
    expect(choiceButtons).toHaveLength(3);
  });

  it("MCQ2: clicking the correct answer grades correct and advances", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "now" });
    setupMcq({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: "le chien" }));

    // MCQ reveal phase — green/red shown for 1.2s
    vi.advanceTimersByTime(1300);

    await waitFor(() => expect(postAttempts).toHaveBeenCalledOnce());
    const attempt = postAttempts.mock.calls[0][0].items[0];
    expect(attempt.correct).toBe(true);
    expect(attempt.mode).toBe("mcq");
    vi.useRealTimers();
  });

  it("MCQ3: clicking a wrong choice grades incorrect", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "now" });
    setupMcq({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await user.click(screen.getByRole("button", { name: "le chat" }));

    // Advance past MCQ reveal
    vi.advanceTimersByTime(1300);

    await waitFor(() => {
      // After wrong answer, card goes to retry pile and re-appears
      expect(screen.getByText("What is a dog?")).toBeInTheDocument();
    });
    // Click correct this time to finish
    await user.click(screen.getByRole("button", { name: "le chien" }));
    vi.advanceTimersByTime(1300);
    await waitFor(() => expect(postAttempts).toHaveBeenCalledOnce());
    const attempts = postAttempts.mock.calls[0][0].items;
    expect(attempts[0].correct).toBe(false);
    expect(attempts[0].mode).toBe("mcq");
    expect(attempts[1].correct).toBe(true);
    vi.useRealTimers();
  });

  it("MCQ4: self_grade mode shows Show answer even if card has distractors", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_DISTRACTORS });
    setup({ startSession, mode: "self_grade" });

    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "le chien" })).toBeNull();
  });

  it("MCQ5: mixed mode uses MCQ for card with distractors", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_DISTRACTORS });
    setup({ startSession, mode: "mixed", shuffleFn: (arr) => arr });

    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /show answer/i })).toBeNull();
    expect(screen.getByRole("button", { name: "le chien" })).toBeInTheDocument();
  });

  it("MCQ6: mixed mode uses self_grade for card without distractors", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession, mode: "mixed" });

    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /show answer/i })).toBeInTheDocument();
  });
});

describe("StudySession — swipe gestures", () => {
  it("SW-1: swipe right on card in ANSWER phase grades correct (knew it)", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    setup({ postAttempts });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await screen.findByText("le chien");

    const card = screen.getByTestId("study-card");
    fireEvent.touchStart(card, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200, clientY: 100 }] });

    await waitFor(() => expect(screen.getByText("What is a cat?")).toBeInTheDocument());
  });

  it("SW-2: swipe left on card in ANSWER phase grades incorrect (didn't know)", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    setup({ postAttempts });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await screen.findByText("le chien");

    const card = screen.getByTestId("study-card");
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 50, clientY: 100 }] });

    await waitFor(() => expect(screen.getByText("What is a cat?")).toBeInTheDocument());
  });

  it("SW-3: swipe in QUESTION phase does not advance card", async () => {
    setup({});

    await screen.findByText("What is a dog?");
    const card = screen.getByTestId("study-card");
    fireEvent.touchStart(card, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200, clientY: 100 }] });

    expect(screen.getByText("What is a dog?")).toBeInTheDocument();
    expect(screen.queryByText("What is a cat?")).toBeNull();
  });
});

describe("StudySession — per-side language TTS", () => {
  const CARDS_WITH_LANG = [
    {
      id: "card-1",
      course_id: COURSE_ID,
      question: "the dog",
      answer: "le chien",
      question_lang: "en",
      answer_lang: "fr-FR",
      sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0,
      next_review_at: "2026-04-22T09:00:00Z",
    },
  ];

  it("auto-speak uses card.question_lang for question and card.answer_lang for answer (AC7)", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: true } };
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_LANG });
    setup({ startSession, courseLang: "fr-FR", tts, currentUser: user });

    await screen.findByText("the dog");
    expect(tts.spokenItems.some((s) => s.text === "the dog" && s.lang === "en")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    expect(tts.spokenItems.some((s) => s.text === "le chien" && s.lang === "fr-FR")).toBe(true);
  });

  it("auto-speak falls back to courseLang when question_lang and answer_lang are null (AC8)", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: true } };
    setup({ courseLang: "fr-FR", tts, currentUser: user });

    await screen.findByText("What is a dog?");
    expect(tts.spokenItems.some((s) => s.text === "What is a dog?" && s.lang === "fr-FR")).toBe(true);
  });

  it("manual speak button uses card.question_lang for question side (AC9)", async () => {
    const tts = createFakeTts({ available: true });
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_LANG });
    setup({ startSession, courseLang: "fr-FR", tts });

    await screen.findByText("the dog");
    await userEvent.click(screen.getByRole("button", { name: /Speak question/i }));
    expect(tts.lastSpoken).toMatchObject({ text: "the dog", lang: "en" });
  });

  it("manual speak button uses card.answer_lang for answer side (AC9b)", async () => {
    const tts = createFakeTts({ available: true });
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_LANG });
    setup({ startSession, courseLang: "fr-FR", tts });

    await screen.findByText("the dog");
    await userEvent.click(screen.getByRole("button", { name: /Show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /Speak answer/i }));
    expect(tts.lastSpoken).toMatchObject({ text: "le chien", lang: "fr-FR" });
  });

  it("auto-speak uses course-level lang defaults when card has no per-side lang", async () => {
    const tts = createFakeTts({ available: true });
    const user = { id: "u-lex", name: "Lex", is_admin: false, settings: { auto_speak: true } };
    setup({
      courseLang: "fr-FR",
      questionLangDefault: "fr",
      answerLangDefault: "nl",
      tts,
      currentUser: user,
    });

    await screen.findByText("What is a dog?");
    // Question: card has no question_lang → questionLangDefault "fr"
    expect(tts.spokenItems.some((s) => s.text === "What is a dog?" && s.lang === "fr")).toBe(true);
  });
});

describe("StudySession — visual polish classes", () => {
  it("grade buttons in ANSWER phase use .btn-primary and .btn-secondary", async () => {
    setup({});
    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    expect(screen.getByRole("button", { name: /knew it/i })).toHaveClass(
      "btn",
      "btn-primary",
    );
    expect(screen.getByRole("button", { name: /didn.t know/i })).toHaveClass(
      "btn",
      "btn-secondary",
    );
  });
});

describe("StudySession — game type features", () => {
  it("speed round displays countdown timer", async () => {
    setup({ gameType: "speed_round" });
    await screen.findByText("What is a dog?");
    expect(screen.getByTestId("speed-timer")).toBeTruthy();
  });

  it("classic mode does NOT show timer", async () => {
    setup({ gameType: "classic" });
    await screen.findByText("What is a dog?");
    expect(screen.queryByTestId("speed-timer")).toBeNull();
  });

  it("passes gameType and cardLimit to startSession", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession, gameType: "boss_round", cardLimit: 10 });
    await screen.findByText("What is a dog?");
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({ gameType: "boss_round", cardLimit: 10 }),
    );
  });

  it("includes cardOrder 'sequential' in the start-session body", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession, cardOrder: "sequential" });
    await screen.findByText("What is a dog?");
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({ cardOrder: "sequential" }),
    );
  });

  it("includes cardOrder 'random' in the start-session body", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession, cardOrder: "random" });
    await screen.findByText("What is a dog?");
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({ cardOrder: "random" }),
    );
  });

  it("omits cardOrder from the start-session body when hardest_first (default)", async () => {
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
    setup({ startSession, cardOrder: "hardest_first" });
    await screen.findByText("What is a dog?");
    const body = startSession.mock.calls[0][0];
    expect(body.cardOrder).toBeUndefined();
  });

  it("speed round MCQ choices stay stable across timer re-renders", async () => {
    let shuffleCount = 0;
    const trackingShuffle = (arr) => { shuffleCount++; return arr; };
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS_WITH_DISTRACTORS });
    setup({ startSession, gameType: "speed_round", mode: "mcq", shuffleFn: trackingShuffle });

    await screen.findByText("What is a dog?");
    const initialCount = shuffleCount;

    // Wait for the real timer to tick — remaining changes from 60→59 after ~1s
    await waitFor(() => {
      expect(screen.getByTestId("speed-timer").textContent).not.toContain("60");
    }, { timeout: 3000 });

    // Without memoization, shuffleFn would be called again on each timer re-render
    expect(shuffleCount).toBe(initialCount);
  }, 10000);

  it("MCQ choices re-shuffle when card changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let shuffleCount = 0;
    const trackingShuffle = (arr) => { shuffleCount++; return arr; };
    const twoCards = [
      { ...CARDS_WITH_DISTRACTORS[0] },
      { id: "card-2", course_id: "c-french", question: "What is a cat?", answer: "le chat", distractors: ["le chien", "le cheval"], sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0, next_review_at: "2026-04-22T09:00:00Z" },
    ];
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: twoCards });
    const postAttempts = vi.fn().mockResolvedValue({ logged: 2 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "now" });
    setup({ startSession, postAttempts, closeSession, mode: "mcq", shuffleFn: trackingShuffle });

    await screen.findByText("What is a dog?");
    const afterFirstCard = shuffleCount;

    // Click correct answer — enters MCQ_REVEAL, then advance past reveal timer
    await user.click(screen.getByRole("button", { name: "le chien" }));
    await act(async () => { vi.advanceTimersByTime(1300); });
    await screen.findByText("What is a cat?");

    // shuffleFn should have been called again for the second card
    expect(shuffleCount).toBeGreaterThan(afterFirstCard);
    vi.useRealTimers();
  });

  it("speed round has no retry pile — wrong cards not re-shown", async () => {
    const singleCard = [CARDS[0]];
    const startSession = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: singleCard });
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "2026-04-22T10:05:00Z" });
    setup({ startSession, postAttempts, closeSession, gameType: "speed_round" });
    await screen.findByText("What is a dog?");
    // Show answer and mark wrong
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /didn.t know/i }));
    // Should go to finishing (no retry), then navigate to results
    await waitFor(() => expect(screen.getByRole("heading", { name: /results/i })).toBeInTheDocument());
  });
});

describe("StudySession — partial save (early end)", () => {
  it("PS-1: shows 'End now' button during card phases for classic mode", async () => {
    setup();
    await screen.findByText("What is a dog?");
    expect(screen.getByRole("button", { name: /End now/i })).toBeInTheDocument();
  });

  it("PS-2: hides 'End now' button in speed_round", async () => {
    setup({ gameType: "speed_round" });
    await screen.findByText("What is a dog?");
    expect(screen.queryByRole("button", { name: /End now/i })).toBeNull();
  });

  it("PS-3: clicking 'End now' after answering some cards saves attempts and navigates to results with partial counts", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({
      ended_at: "2026-04-22T10:05:00Z",
      cards_studied: 1,
      cards_correct: 1,
      duration_seconds: 20,
      xp_earned: 10,
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    // Answer just the first card correctly
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));
    // Now on card-2 — click End now without answering it
    await screen.findByText("What is a cat?");
    await userEvent.click(screen.getByRole("button", { name: /End now/i }));

    await waitFor(() => {
      expect(postAttempts).toHaveBeenCalledOnce();
      expect(closeSession).toHaveBeenCalledOnce();
    });

    const attemptsCall = postAttempts.mock.calls[0][0];
    expect(attemptsCall.sessionId).toBe(SESSION_ID);
    expect(attemptsCall.items).toHaveLength(1);
    expect(attemptsCall.items[0].correct).toBe(true);

    const closeCall = closeSession.mock.calls[0][1];
    expect(closeCall.cards_studied).toBe(1);
    expect(closeCall.cards_correct).toBe(1);

    await screen.findByText("Results");
    confirmSpy.mockRestore();
  });

  it("PS-4: clicking 'End now' with zero answers does not save and navigates back", async () => {
    const postAttempts = vi.fn();
    const closeSession = vi.fn();
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /End now/i }));

    // Should leave the study screen without calling save endpoints
    await waitFor(() => {
      expect(screen.queryByText("What is a dog?")).toBeNull();
    });
    expect(postAttempts).not.toHaveBeenCalled();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it("PS-5: clicking 'End now' and cancelling the confirm keeps the session active", async () => {
    const postAttempts = vi.fn();
    const closeSession = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));
    await screen.findByText("What is a cat?");
    await userEvent.click(screen.getByRole("button", { name: /End now/i }));

    expect(postAttempts).not.toHaveBeenCalled();
    expect(closeSession).not.toHaveBeenCalled();
    // Still on the study screen
    expect(screen.getByText("What is a cat?")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("PS-6: unmounting mid-session flushes pending attempts via keepalive", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({});
    const { unmount } = setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));
    await screen.findByText("What is a cat?");

    unmount();

    await waitFor(() => {
      expect(postAttempts).toHaveBeenCalledOnce();
      expect(closeSession).toHaveBeenCalledOnce();
    });
    expect(postAttempts.mock.calls[0][1]).toMatchObject({ keepalive: true });
    expect(closeSession.mock.calls[0][2]).toMatchObject({ keepalive: true });
    expect(closeSession.mock.calls[0][1]).toMatchObject({ cards_studied: 1, cards_correct: 1 });
  });

  it("PS-7: pagehide event flushes pending attempts via keepalive", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 1 });
    const closeSession = vi.fn().mockResolvedValue({});
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));
    await screen.findByText("What is a cat?");

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      expect(postAttempts).toHaveBeenCalledOnce();
      expect(closeSession).toHaveBeenCalledOnce();
    });
    expect(postAttempts.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it("PS-8: unmount with zero attempts does not flush", async () => {
    const postAttempts = vi.fn();
    const closeSession = vi.fn();
    const { unmount } = setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    unmount();

    expect(postAttempts).not.toHaveBeenCalled();
    expect(closeSession).not.toHaveBeenCalled();
  });

  it("PS-9: completing a full session and then pagehide does not double-save", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 2 });
    const closeSession = vi.fn().mockResolvedValue({
      ended_at: "now", cards_studied: 2, cards_correct: 2, duration_seconds: 30, xp_earned: 20,
    });
    setup({ postAttempts, closeSession });

    await screen.findByText("What is a dog?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));
    await screen.findByText("What is a cat?");
    await userEvent.click(screen.getByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /knew it/i }));

    await screen.findByText("Results");
    expect(postAttempts).toHaveBeenCalledOnce();
    expect(closeSession).toHaveBeenCalledOnce();

    // Now fire pagehide — should not trigger another save
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((r) => setTimeout(r, 10));
    expect(postAttempts).toHaveBeenCalledOnce();
    expect(closeSession).toHaveBeenCalledOnce();
  });
});
