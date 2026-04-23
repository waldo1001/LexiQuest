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

function setup({ importCards = vi.fn(), lang = "en" } = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter
        initialEntries={[{
          pathname: `/courses/${COURSE_ID}/import`,
          state: { courseId: COURSE_ID, courseName: COURSE_NAME, ownerId: OWNER_ID },
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

});
