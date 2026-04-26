import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import PhotoImport from "./PhotoImport.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const COURSE_ID = "course-fr";
const COURSE_NAME = "French 🇫🇷";
const OWNER_ID = "u-lex";

const CANDIDATES = [
  { question: "le chien", answer: "the dog", distractors: ["the cat", "the bird"] },
  { question: "la maison", answer: "the house", distractors: ["the car", "the tree"] },
];

function setup({ importCards = vi.fn(), lang = "en", courseLang = null, questionLangDefault = null, answerLangDefault = null } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/courses/${COURSE_ID}/import`,
          state: { courseId: COURSE_ID, courseName: COURSE_NAME, ownerId: OWNER_ID, courseLang, questionLangDefault, answerLangDefault },
        }]}
      >
        <Routes>
          <Route
            path="/courses/:courseId/import"
            element={<PhotoImport importCards={importCards} />}
          />
          <Route
            path="/courses/:courseId/import/review"
            element={<h1 data-testid="review-screen">Review</h1>}
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

describe("PhotoImport", () => {
  it("renders the import heading", () => {
    setup();
    expect(screen.getByRole("heading", { name: /import cards/i })).toBeInTheDocument();
  });

  it("renders file input", () => {
    setup();
    const input = document.querySelector("input[type='file']");
    expect(input).not.toBeNull();
  });

  it("shows extract button", () => {
    setup();
    expect(screen.getByRole("button", { name: /extract cards/i })).toBeInTheDocument();
  });

  it("shows error when extract is clicked with no file selected", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    expect(screen.getByText(/please select a photo/i)).toBeInTheDocument();
  });

  it("shows loading state while extracting", async () => {
    const user = userEvent.setup();
    let resolve;
    const importCards = vi.fn(() => new Promise((res) => { resolve = res; }));
    setup({ importCards });

    // Simulate file selection by triggering change event directly
    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    expect(screen.getByText(/extracting cards/i)).toBeInTheDocument();
    resolve({ candidates: CANDIDATES });
  });

  it("navigates to review screen on success", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() =>
      expect(screen.getByTestId("review-screen")).toBeInTheDocument(),
    );
  });

  it("shows parse error on parse_error", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockRejectedValue(new Error("parse_error"));
    setup({ importCards });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() =>
      expect(screen.getByText(/clearer image/i)).toBeInTheDocument(),
    );
  });

  it("shows claude error on claude_error", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockRejectedValue(new Error("claude_error"));
    setup({ importCards });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() =>
      expect(screen.getByText(/unavailable/i)).toBeInTheDocument(),
    );
  });

  it("shows generic error on unknown error", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockRejectedValue(new Error("network_fail"));
    setup({ importCards });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument(),
    );
  });

  it("renders in Dutch under lang=nl", () => {
    setup({ lang: "nl" });
    expect(screen.getByRole("heading", { name: /foto/i })).toBeInTheDocument();
  });

  it("back link navigates to cards screen", () => {
    setup();
    const link = screen.getByRole("link", { name: /back/i });
    expect(link).toHaveAttribute("href", `/courses/${COURSE_ID}/cards`);
  });

  it("renders without location state (no crash)", () => {
    // Tests the `location.state ?? {}` null branch
    render(
      <AppProvider>
        <MemoryRouter initialEntries={[`/courses/${COURSE_ID}/import`]}>
          <Routes>
            <Route path="/courses/:courseId/import" element={<PhotoImport />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
    expect(screen.getByRole("heading", { name: /import cards/i })).toBeInTheDocument();
  });

  it("shows language dropdowns when courseLang is set", () => {
    setup({ courseLang: "fr-FR" });
    expect(screen.getByLabelText(/speak questions in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/speak answers in/i)).toBeInTheDocument();
  });

  it("hides language dropdowns when courseLang is null", () => {
    setup({ courseLang: null });
    expect(screen.queryByLabelText(/speak questions in/i)).toBeNull();
    expect(screen.queryByLabelText(/speak answers in/i)).toBeNull();
  });

  it("defaults both language dropdowns to the user's UI language", () => {
    setup({ courseLang: "fr-FR", lang: "nl" });
    expect(screen.getByLabelText(/vragen uitspreken in/i)).toHaveValue("nl");
    expect(screen.getByLabelText(/antwoorden uitspreken in/i)).toHaveValue("nl");
  });

  it("passes questionLang and answerLang to importCards", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, courseLang: "fr-FR", lang: "en" });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());

    const call = importCards.mock.calls[0][0];
    expect(call.questionLang).toBe("en");
    expect(call.answerLang).toBe("en");
  });

  it("user can change language selections", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, courseLang: "fr-FR", lang: "en" });

    await user.selectOptions(screen.getByLabelText(/speak questions in/i), "nl");
    await user.selectOptions(screen.getByLabelText(/speak answers in/i), "de");

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());

    const call = importCards.mock.calls[0][0];
    expect(call.questionLang).toBe("nl");
    expect(call.answerLang).toBe("de");
  });

  it("does not send questionLang/answerLang when courseLang is null", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, courseLang: null });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());

    const call = importCards.mock.calls[0][0];
    expect(call.questionLang).toBeUndefined();
    expect(call.answerLang).toBeUndefined();
  });

  it("allows setting language to empty (not specified)", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, courseLang: "fr-FR", lang: "en" });

    await user.selectOptions(screen.getByLabelText(/speak questions in/i), "");
    await user.selectOptions(screen.getByLabelText(/speak answers in/i), "");

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());

    const call = importCards.mock.calls[0][0];
    expect(call.questionLang).toBe("");
    expect(call.answerLang).toBe("");
  });

  it("renders language dropdowns in Dutch under lang=nl", () => {
    setup({ lang: "nl", courseLang: "fr-FR" });
    expect(screen.getByLabelText(/vragen uitspreken in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/antwoorden uitspreken in/i)).toBeInTheDocument();
  });

  it("uses course-level lang defaults as dropdown values when set", () => {
    setup({ courseLang: "fr-FR", questionLangDefault: "fr", answerLangDefault: "nl" });
    expect(screen.getByLabelText(/speak questions in/i)).toHaveValue("fr");
    expect(screen.getByLabelText(/speak answers in/i)).toHaveValue("nl");
  });

  it("falls back to uiLang for both dropdowns when course-level defaults are null", () => {
    setup({ courseLang: "fr-FR", lang: "en" });
    // both default to baseTag(uiLang) = "en"
    expect(screen.getByLabelText(/speak questions in/i)).toHaveValue("en");
    expect(screen.getByLabelText(/speak answers in/i)).toHaveValue("en");
  });
});
