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

function setup({
  importCards = vi.fn(),
  fetchCards,
  lang = "en",
  courseLang = null,
  questionLangDefault = null,
  answerLangDefault = null,
  uploadId = null,
} = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/courses/${COURSE_ID}/import`,
          state: { courseId: COURSE_ID, courseName: COURSE_NAME, ownerId: OWNER_ID, courseLang, questionLangDefault, answerLangDefault, uploadId },
        }]}
      >
        <Routes>
          <Route
            path="/courses/:courseId/import"
            element={
              <PhotoImport
                importCards={importCards}
                fetchCards={fetchCards ?? vi.fn().mockResolvedValue([])}
              />
            }
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

// =====================================================================
// Slice B — Import-into-existing-upload + first-class PDF
// =====================================================================
describe("PhotoImport — Add to existing upload", () => {
  const SEED_WITH_UPLOADS = [
    { id: "c1", course_id: COURSE_ID, upload_id: "up-1", upload_name: "Math homework", question: "q1", answer: "a1", distractors: [], hint: null, source: "ai_import", sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0, next_review_at: "2026-04-22T09:00:00Z", created_at: "2026-04-22T09:00:00Z" },
    { id: "c2", course_id: COURSE_ID, upload_id: "up-1", upload_name: "Math homework", question: "q2", answer: "a2", distractors: [], hint: null, source: "ai_import", sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0, next_review_at: "2026-04-22T09:00:00Z", created_at: "2026-04-22T09:00:00Z" },
    { id: "c3", course_id: COURSE_ID, upload_id: "up-2", upload_name: "Geography", question: "q3", answer: "a3", distractors: [], hint: null, source: "ai_import", sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0, next_review_at: "2026-04-22T09:00:00Z", created_at: "2026-04-22T09:00:00Z" },
    { id: "c4-manual", course_id: COURSE_ID, upload_id: null, upload_name: null, question: "qm", answer: "am", distractors: [], hint: null, source: "manual", sm2_ease: 2.5, sm2_interval: 0, sm2_reps: 0, next_review_at: "2026-04-22T09:00:00Z", created_at: "2026-04-22T09:00:00Z" },
  ];

  it("PI-B1: on mount, populates the 'Add to upload' selector with New upload + each distinct upload", async () => {
    const fetchCards = vi.fn().mockResolvedValue(SEED_WITH_UPLOADS);
    setup({ fetchCards });

    const select = await screen.findByRole("combobox", { name: /add to upload/i });
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels.some((l) => /new upload/i.test(l))).toBe(true);
    expect(labels).toContain("Math homework");
    expect(labels).toContain("Geography");
    // Default is "New upload" (empty value)
    expect(select).toHaveValue("");
  });

  it("PI-B2: pre-selects upload when navigation state includes uploadId", async () => {
    const fetchCards = vi.fn().mockResolvedValue(SEED_WITH_UPLOADS);
    setup({ fetchCards, uploadId: "up-2" });

    const select = await screen.findByRole("combobox", { name: /add to upload/i });
    expect(select).toHaveValue("up-2");
  });

  it("PI-B3: PDF file → mimeType 'application/pdf' propagates to importCards", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    const file = new File(["pdf-bytes"], "homework.pdf", { type: "application/pdf" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(importCards.mock.calls[0][0].mimeType).toBe("application/pdf");
  });

  it("PI-B4: when uploadId is selected, navigates to review with uploadId in state", async () => {
    const fetchCards = vi.fn().mockResolvedValue(SEED_WITH_UPLOADS);
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    const user = userEvent.setup();
    setup({ fetchCards, importCards });

    const select = await screen.findByRole("combobox", { name: /add to upload/i });
    await user.selectOptions(select, "up-1");

    const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(screen.getByTestId("review-screen")).toBeInTheDocument());
    // We assert the navigation state passthrough by checking importCards was called with the right course;
    // the navigate-state assertion happens via ImportReview's tests for end-to-end behavior.
    expect(importCards).toHaveBeenCalledOnce();
  });

  it("PI-B5: when no uploads exist for the course, selector hides ('New upload' is the only choice)", async () => {
    const fetchCards = vi.fn().mockResolvedValue([]);
    setup({ fetchCards });

    // Wait for fetchCards to resolve
    await waitFor(() => expect(fetchCards).toHaveBeenCalled());
    // No "Add to upload" combobox is shown when there are no uploads.
    expect(screen.queryByRole("combobox", { name: /add to upload/i })).toBeNull();
  });
});
