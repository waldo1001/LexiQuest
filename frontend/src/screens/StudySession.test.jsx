import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StudySession from "./StudySession.jsx";
import { AppProvider } from "../context/AppContext.jsx";
import { createFakeTts } from "../testing/fake-tts.js";

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
  lang = "en",
  currentUser = { id: "u-lex", name: "Lex", is_admin: false },
  tts,
} = {}) {
  const defaultStart = vi.fn().mockResolvedValue({ sessionId: SESSION_ID, cards: CARDS });
  const defaultAttempts = vi.fn().mockResolvedValue({ logged: 2 });
  const defaultClose = vi.fn().mockResolvedValue({ ended_at: "2026-04-22T10:05:00Z" });

  return render(
    <AppProvider initialLang={lang} initialUser={currentUser} tts={tts}>
      <MemoryRouter
        initialEntries={[
          { pathname: `/courses/${courseId}/study`, state: { courseName, mode, courseLang } },
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
              />
            }
          />
          <Route path="/courses" element={<h1>Courses</h1>} />
          <Route path="/courses/:courseId/results" element={<h1>Results</h1>} />
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
  it("calls postAttempts and closeSession on completion, then navigates to results", async () => {
    const postAttempts = vi.fn().mockResolvedValue({ logged: 2 });
    const closeSession = vi.fn().mockResolvedValue({ ended_at: "2026-04-22T10:05:00Z" });
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
