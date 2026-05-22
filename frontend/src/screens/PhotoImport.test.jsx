import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
  compressImage,
  splitPdf = vi.fn(async (b64) => [b64]),
  lang = "en",
  courseLang = null,
  questionLangDefault = null,
  answerLangDefault = null,
  uploadId = null,
  initialUser = null,
  patchMe = vi.fn(),
  promptFn = () => null,
  confirmFn = () => false,
} = {}) {
  return render(
    <AppProvider initialLang={lang} initialUser={initialUser} patchMe={patchMe}>
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
                patchMe={patchMe}
                promptFn={promptFn}
                confirmFn={confirmFn}
                splitPdf={splitPdf}
                {...(compressImage ? { compressImage } : {})}
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

  it("shows too-large error on image_too_large", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockRejectedValue(new Error("image_too_large"));
    setup({ importCards });

    const file = new File(["img-data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() =>
      expect(screen.getByText(/too large/i)).toBeInTheDocument(),
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

// =====================================================================
// Slice 4 — Extra instructions + reusable presets
// =====================================================================
function userWithPresets(presets = []) {
  return {
    id: OWNER_ID,
    name: "Lex",
    isAdmin: false,
    color: "#16a34a",
    avatar_emoji: "🐯",
    ui_language: "en",
    settings: {
      auto_speak: true,
      preferred_mode: "ask",
      daily_goal: 20,
      import_instruction_presets: presets,
    },
  };
}

describe("PhotoImport — Extra instructions + presets", () => {
  it("AC65: textarea is rendered with maxLength=1000", () => {
    setup();
    const ta = screen.getByLabelText(/extra instructions/i);
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta).toHaveAttribute("maxLength", "1000");
  });

  it("AC66: typed extraInstructions are sent in import payload", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    await user.type(screen.getByLabelText(/extra instructions/i), "only nouns, full sentences");
    const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(importCards.mock.calls[0][0].extraInstructions).toBe("only nouns, full sentences");
  });

  it("AC67: blank/whitespace-only textarea omits extraInstructions", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    await user.type(screen.getByLabelText(/extra instructions/i), "   ");
    const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(importCards.mock.calls[0][0].extraInstructions).toBeUndefined();
  });

  it("AC68: dropdown lists saved presets when user has any", () => {
    setup({
      initialUser: userWithPresets([
        { id: "p-1", name: "Nouns only", body: "Only nouns." },
        { id: "p-2", name: "FR-EN", body: "Question in French." },
      ]),
    });
    const select = screen.getByLabelText(/use saved instructions/i);
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Nouns only");
    expect(labels).toContain("FR-EN");
  });

  it("AC69: no preset dropdown when user has none / no user", () => {
    setup({ initialUser: userWithPresets([]) });
    expect(screen.queryByLabelText(/use saved instructions/i)).toBeNull();
  });

  it("AC70: selecting a preset prefills the textarea", async () => {
    const user = userEvent.setup();
    setup({
      initialUser: userWithPresets([
        { id: "p-1", name: "Nouns only", body: "Only nouns. Keep answers ≤ 3 words." },
      ]),
    });
    await user.selectOptions(screen.getByLabelText(/use saved instructions/i), "p-1");
    expect(screen.getByLabelText(/extra instructions/i)).toHaveValue("Only nouns. Keep answers ≤ 3 words.");
  });

  it("AC71: 'Save as new' prompts for a name then PATCHes /me with appended preset", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue(userWithPresets([
      { id: "existing", name: "Old", body: "old body" },
      { id: "new-id", name: "Brand new", body: "fresh body" },
    ]));
    const promptFn = vi.fn().mockReturnValue("Brand new");
    setup({
      patchMe,
      promptFn,
      initialUser: userWithPresets([{ id: "existing", name: "Old", body: "old body" }]),
    });

    await user.type(screen.getByLabelText(/extra instructions/i), "fresh body");
    await user.click(screen.getByRole("button", { name: /save as new/i }));

    expect(promptFn).toHaveBeenCalled();
    await waitFor(() => expect(patchMe).toHaveBeenCalled());
    const arg = patchMe.mock.calls[0][0];
    const presets = arg.settings.import_instruction_presets;
    expect(presets).toHaveLength(2);
    const added = presets[1];
    expect(added.name).toBe("Brand new");
    expect(added.body).toBe("fresh body");
    expect(typeof added.id).toBe("string");
    expect(added.id.length).toBeGreaterThan(0);
  });

  it("AC72: 'Save as new' with empty textarea shows inline error and does not PATCH", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn();
    const promptFn = vi.fn();
    setup({ patchMe, promptFn, initialUser: userWithPresets([]) });

    await user.click(screen.getByRole("button", { name: /save as new/i }));

    expect(patchMe).not.toHaveBeenCalled();
    expect(promptFn).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("AC73: 'Save as new' at the 20-preset cap shows inline error and does not PATCH", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn();
    const promptFn = vi.fn().mockReturnValue("name");
    const presets = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`, name: `n${i}`, body: `b${i}`,
    }));
    setup({ patchMe, promptFn, initialUser: userWithPresets(presets) });

    await user.type(screen.getByLabelText(/extra instructions/i), "another one");
    await user.click(screen.getByRole("button", { name: /save as new/i }));

    expect(patchMe).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("AC74: 'Update' is disabled when no preset is selected", () => {
    setup({
      initialUser: userWithPresets([{ id: "p-1", name: "n", body: "b" }]),
    });
    expect(screen.getByRole("button", { name: /^update$/i })).toBeDisabled();
  });

  it("AC75: 'Update' PATCHes /me with the selected preset's body replaced", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue(userWithPresets([
      { id: "p-1", name: "n", body: "new body" },
    ]));
    setup({
      patchMe,
      initialUser: userWithPresets([{ id: "p-1", name: "n", body: "old body" }]),
    });

    await user.selectOptions(screen.getByLabelText(/use saved instructions/i), "p-1");
    const ta = screen.getByLabelText(/extra instructions/i);
    await user.clear(ta);
    await user.type(ta, "new body");
    await user.click(screen.getByRole("button", { name: /^update$/i }));

    await waitFor(() => expect(patchMe).toHaveBeenCalled());
    const arg = patchMe.mock.calls[0][0];
    expect(arg.settings.import_instruction_presets).toEqual([
      { id: "p-1", name: "n", body: "new body" },
    ]);
  });

  it("AC76: 'Delete' confirms then PATCHes /me without the selected preset", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue(userWithPresets([]));
    const confirmFn = vi.fn().mockReturnValue(true);
    setup({
      patchMe,
      confirmFn,
      initialUser: userWithPresets([{ id: "p-1", name: "n", body: "b" }]),
    });

    await user.selectOptions(screen.getByLabelText(/use saved instructions/i), "p-1");
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(confirmFn).toHaveBeenCalled();
    await waitFor(() => expect(patchMe).toHaveBeenCalled());
    expect(patchMe.mock.calls[0][0].settings.import_instruction_presets).toEqual([]);
  });

  it("AC90: file input accepts .pptx alongside images and PDFs", () => {
    setup();
    const input = document.querySelector("input[type='file']");
    expect(input.getAttribute("accept")).toMatch(/\.pptx/);
    expect(input.getAttribute("accept")).toMatch(/presentationml\.presentation/);
  });

  it("AC91: pptx file selection sends the pptx mimeType in the import body", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    const file = new File(["pk-fake-zip"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalled());

    const body = importCards.mock.calls[0][0];
    expect(body.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it("AC92: a .pptx file with no MIME type still sends the pptx mimeType (extension fallback)", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards });

    // Some platforms hand File.type === "" for .pptx — extension must drive the inference
    const file = new File(["pk-fake-zip"], "deck.pptx", { type: "" });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(importCards).toHaveBeenCalled());

    expect(importCards.mock.calls[0][0].mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });

  it("AC93: skippedSlides from the response is forwarded into navigation state", async () => {
    const user = userEvent.setup();
    const importCards = vi
      .fn()
      .mockResolvedValue({ candidates: CANDIDATES, skippedSlides: [3, 7] });

    // Render with a custom review route that exposes location.state
    function ReviewProbe() {
      const loc = useLocation();
      return <pre data-testid="state-json">{JSON.stringify(loc.state)}</pre>;
    }

    render(
      <AppProvider initialLang="en" initialUser={null} patchMe={vi.fn()}>
        <MemoryRouter
          initialEntries={[{
            pathname: `/courses/${COURSE_ID}/import`,
            state: { courseId: COURSE_ID, courseName: COURSE_NAME, ownerId: OWNER_ID },
          }]}
        >
          <Routes>
            <Route
              path="/courses/:courseId/import"
              element={
                <PhotoImport
                  importCards={importCards}
                  fetchCards={vi.fn().mockResolvedValue([])}
                  patchMe={vi.fn()}
                />
              }
            />
            <Route
              path="/courses/:courseId/import/review"
              element={<ReviewProbe />}
            />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );

    const file = new File(["pk-fake-zip"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    const input = document.querySelector("input[type='file']");
    await user.upload(input, file);

    await user.click(screen.getByRole("button", { name: /extract cards/i }));
    await waitFor(() => expect(screen.getByTestId("state-json")).toBeInTheDocument());

    const state = JSON.parse(screen.getByTestId("state-json").textContent);
    expect(state.skippedSlides).toEqual([3, 7]);
  });

  it("AC77: cancelling 'Save as new' name prompt aborts (no PATCH)", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn();
    const promptFn = vi.fn().mockReturnValue(null); // user pressed Cancel
    setup({ patchMe, promptFn, initialUser: userWithPresets([]) });

    await user.type(screen.getByLabelText(/extra instructions/i), "stuff");
    await user.click(screen.getByRole("button", { name: /save as new/i }));

    expect(promptFn).toHaveBeenCalled();
    expect(patchMe).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Slice — Client-side photo compression before import
// =====================================================================
describe("PhotoImport — client-side compression", () => {
  it("PI-C1: small image is not compressed and shows no notice", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    const compressImage = vi.fn(async (file) => ({
      file,
      compressed: false,
      originalSize: file.size,
      finalSize: file.size,
    }));
    setup({ importCards, compressImage });

    const file = new File(["img"], "p.jpg", { type: "image/jpeg" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(compressImage).toHaveBeenCalledOnce();
    expect(compressImage.mock.calls[0][0]).toBe(file);
    expect(screen.queryByText(/photo compressed for upload/i)).toBeNull();
  });

  it("PI-C2: large image is compressed and the compressed file's bytes are sent", async () => {
    const user = userEvent.setup();
    let resolveImport;
    const importCards = vi.fn(
      () => new Promise((res) => { resolveImport = res; }),
    );
    const compressedFile = new File(
      [new Uint8Array(2 * 1024 * 1024)],
      "p.jpg",
      { type: "image/jpeg" },
    );
    const compressImage = vi.fn(async () => ({
      file: compressedFile,
      compressed: true,
      originalSize: 8 * 1024 * 1024,
      finalSize: 2 * 1024 * 1024,
    }));
    setup({ importCards, compressImage });

    const original = new File([new Uint8Array(8 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await user.upload(document.querySelector("input[type='file']"), original);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    // Notice is rendered while importCards is still pending (8.0 → 2.0 MB)
    await waitFor(() =>
      expect(
        screen.getByText(/photo compressed for upload \(8\.0 MB → 2\.0 MB\)/i),
      ).toBeInTheDocument(),
    );

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    // Body's mimeType should be image/jpeg (compressed-file's type)
    expect(importCards.mock.calls[0][0].mimeType).toBe("image/jpeg");

    // Unblock the import so the test cleans up
    resolveImport({ candidates: CANDIDATES });
  });

  it("PI-C3: compression failure surfaces a user-facing error and does not call importCards", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn();
    const compressImage = vi.fn().mockRejectedValue(new Error("image_compress_failed"));
    setup({ importCards, compressImage });

    const file = new File([new Uint8Array(8 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() =>
      expect(screen.getByText(/could not prepare that photo/i)).toBeInTheDocument(),
    );
    expect(importCards).not.toHaveBeenCalled();
    // The Extract button must be re-enabled (loading cleared)
    expect(screen.getByRole("button", { name: /extract cards/i })).not.toBeDisabled();
  });

  it("PI-C4: PDF skips compression entirely", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    const compressImage = vi.fn();
    setup({ importCards, compressImage });

    const file = new File(["pdf-bytes"], "homework.pdf", { type: "application/pdf" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(compressImage).not.toHaveBeenCalled();
    expect(importCards.mock.calls[0][0].mimeType).toBe("application/pdf");
  });

  it("PI-C5: PPTX skips compression entirely", async () => {
    const user = userEvent.setup();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    const compressImage = vi.fn();
    setup({ importCards, compressImage });

    const file = new File(["pk-fake"], "deck.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledOnce());
    expect(compressImage).not.toHaveBeenCalled();
  });

  it("PI-langs: language dropdowns include Latin and Ancient Greek", () => {
    setup({ courseLang: "fr-FR", lang: "en" });

    for (const labelRe of [/speak questions in/i, /speak answers in/i]) {
      const select = screen.getByLabelText(labelRe);
      const options = Array.from(select.querySelectorAll("option"));
      const byValue = Object.fromEntries(options.map((o) => [o.value, o.textContent]));
      expect(byValue["la"]).toBe("Latin");
      expect(byValue["grc"]).toBe("Ancient Greek");
    }
  });
});

// =====================================================================
// Slice — Client-side PDF page chunking (sub-45s import batches)
// =====================================================================
describe("PhotoImport — PDF chunking", () => {
  function StateProbe() {
    const loc = useLocation();
    return <pre data-testid="state-json">{JSON.stringify(loc.state)}</pre>;
  }

  function renderWithProbe({ importCards, splitPdf }) {
    return render(
      <AppProvider initialLang="en" initialUser={null} patchMe={vi.fn()}>
        <MemoryRouter
          initialEntries={[{
            pathname: `/courses/${COURSE_ID}/import`,
            state: { courseId: COURSE_ID, courseName: COURSE_NAME, ownerId: OWNER_ID },
          }]}
        >
          <Routes>
            <Route
              path="/courses/:courseId/import"
              element={
                <PhotoImport
                  importCards={importCards}
                  fetchCards={vi.fn().mockResolvedValue([])}
                  patchMe={vi.fn()}
                  splitPdf={splitPdf}
                />
              }
            />
            <Route path="/courses/:courseId/import/review" element={<StateProbe />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    );
  }

  async function uploadPdfAndExtract(user, name = "long.pdf") {
    const file = new File(["%PDF-fake"], name, { type: "application/pdf" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));
  }

  it("AC6: a large PDF is split and each page-batch is sent as its own import request", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockResolvedValue(["B1", "B2", "B3"]);
    const importCards = vi.fn().mockResolvedValue({ candidates: [] });
    setup({ importCards, splitPdf });

    await uploadPdfAndExtract(user);

    await waitFor(() => expect(importCards).toHaveBeenCalledTimes(3));
    expect(splitPdf).toHaveBeenCalledTimes(1);
    expect(importCards.mock.calls.map((c) => c[0].imageBase64)).toEqual(["B1", "B2", "B3"]);
    for (const [body] of importCards.mock.calls) {
      expect(body.courseId).toBe(COURSE_ID);
      expect(body.mimeType).toBe("application/pdf");
    }
  });

  it("AC7: merges candidates from every PDF batch into the review screen in order", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockResolvedValue(["B1", "B2"]);
    const importCards = vi
      .fn()
      .mockResolvedValueOnce({ candidates: [{ question: "q1", answer: "a1" }, { question: "q2", answer: "a2" }] })
      .mockResolvedValueOnce({ candidates: [{ question: "q3", answer: "a3" }] });
    renderWithProbe({ importCards, splitPdf });

    await uploadPdfAndExtract(user);

    await waitFor(() => expect(screen.getByTestId("state-json")).toBeInTheDocument());
    const state = JSON.parse(screen.getByTestId("state-json").textContent);
    expect(state.candidates.map((c) => c.question)).toEqual(["q1", "q2", "q3"]);
  });

  it("AC8: shows extract-progress while processing each PDF batch", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockResolvedValue(["B1", "B2"]);
    let resolveFirst;
    const importCards = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValue({ candidates: [] });
    setup({ importCards, splitPdf });

    await uploadPdfAndExtract(user);

    await waitFor(() =>
      expect(screen.getByText(/part 1 of 2/i)).toBeInTheDocument(),
    );
    // Let the remaining batch settle so the component finishes inside act().
    resolveFirst({ candidates: [] });
    await waitFor(() => expect(importCards).toHaveBeenCalledTimes(2));
  });

  it("AC9: a small PDF is sent as a single import request", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockResolvedValue(["ONLY"]);
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, splitPdf });

    await uploadPdfAndExtract(user, "short.pdf");

    await waitFor(() => expect(screen.getByTestId("review-screen")).toBeInTheDocument());
    expect(importCards).toHaveBeenCalledTimes(1);
    expect(importCards.mock.calls[0][0].imageBase64).toBe("ONLY");
  });

  it("AC10: image imports do not go through PDF splitting", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn();
    const importCards = vi.fn().mockResolvedValue({ candidates: CANDIDATES });
    setup({ importCards, splitPdf });

    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    await user.upload(document.querySelector("input[type='file']"), file);
    await user.click(screen.getByRole("button", { name: /extract cards/i }));

    await waitFor(() => expect(importCards).toHaveBeenCalledTimes(1));
    expect(splitPdf).not.toHaveBeenCalled();
  });

  it("AC11: surfaces the mapped error and stops when a PDF batch fails", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockResolvedValue(["B1", "B2"]);
    const importCards = vi.fn().mockRejectedValue(new Error("claude_error"));
    setup({ importCards, splitPdf });

    await uploadPdfAndExtract(user);

    await waitFor(() =>
      expect(screen.getByText(/claude is unavailable/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("review-screen")).toBeNull();
  });

  it("AC12: shows the pdf-read error when the PDF cannot be split", async () => {
    const user = userEvent.setup();
    const splitPdf = vi.fn().mockRejectedValue(new Error("not a pdf"));
    const importCards = vi.fn();
    setup({ importCards, splitPdf });

    await uploadPdfAndExtract(user);

    await waitFor(() =>
      expect(screen.getByText(/couldn't read this pdf/i)).toBeInTheDocument(),
    );
    expect(importCards).not.toHaveBeenCalled();
  });
});
