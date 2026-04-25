import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import CourseList from "./CourseList.jsx";
import { AppProvider } from "../context/AppContext.jsx";
import { waitFor } from "@testing-library/react";

const CURRENT_YEAR = {
  id: "y-2025",
  label: "2025-2026",
  is_current: true,
  start_date: "2025-09-01",
  end_date: "2026-06-30",
};

const OTHER_YEAR = {
  id: "y-2024",
  label: "2024-2025",
  is_current: false,
  start_date: "2024-09-01",
  end_date: "2025-06-30",
};

const SEED_COURSES = [
  {
    id: "c-1",
    user_id: "u-lex",
    year_id: "y-2025",
    name: "French",
    emoji: "🇫🇷",
    color: "#0000ff",
    language: "fr-FR",
    default_mode: "mcq",
    created_at: "2026-04-22T00:00:00Z",
  },
  {
    id: "c-2",
    user_id: "u-lex",
    year_id: "y-2025",
    name: "Math",
    emoji: "📐",
    color: "#ff0000",
    language: null,
    default_mode: "self_grade",
    created_at: "2026-04-22T00:00:00Z",
  },
];

const ASK_COURSE = {
  id: "c-ask",
  user_id: "u-lex",
  year_id: "y-2025",
  name: "Science",
  emoji: "🔬",
  color: "#00ff00",
  language: "fr-FR",
  default_mode: "ask",
  created_at: "2026-04-22T00:00:00Z",
};

function setup({
  fetchYears,
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  confirmFn,
  lang = "en",
  enrichCards,
} = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter initialEntries={["/courses"]}>
        <Routes>
          <Route
            path="/courses"
            element={
              <CourseList
                fetchYears={
                  fetchYears ??
                  vi.fn().mockResolvedValue([CURRENT_YEAR, OTHER_YEAR])
                }
                fetchCourses={
                  fetchCourses ?? vi.fn().mockResolvedValue(SEED_COURSES)
                }
                createCourse={createCourse ?? vi.fn()}
                updateCourse={updateCourse ?? vi.fn()}
                deleteCourse={deleteCourse ?? vi.fn()}
                confirmFn={confirmFn ?? vi.fn(() => false)}
                {...(enrichCards ? { enrichCards } : {})}
              />
            }
          />
          <Route path="/home" element={<h1>Home</h1>} />
          <Route path="/courses/:courseId/study" element={<h1>Study</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

function cardFor(name) {
  return screen.getByText(name).closest("article");
}

describe("CourseList", () => {
  it("CL1: renders loading indicator initially", () => {
    setup({ fetchYears: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading courses/i)).toBeInTheDocument();
  });

  it("CL2: lists courses for the current year", async () => {
    setup();
    expect(await screen.findByText("French")).toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();
  });

  it("CL3: New course submits createCourse with the current year_id", async () => {
    const createCourse = vi.fn().mockResolvedValue({
      id: "c-3",
      user_id: "u-lex",
      year_id: "y-2025",
      name: "English",
      emoji: "🇬🇧",
      color: "#2563eb",
      language: "en-GB",
      default_mode: "ask",
      created_at: "2026-04-22T00:00:00Z",
    });
    const user = userEvent.setup();
    setup({ createCourse });

    await screen.findByText("French");
    await user.click(screen.getByRole("button", { name: /new course/i }));

    await user.type(screen.getByLabelText(/^name$/i), "English");
    await user.type(screen.getByLabelText(/^emoji$/i), "🇬🇧");
    await user.click(screen.getByRole("button", { name: /create course/i }));

    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ name: "English", year_id: "y-2025" }),
    );
    expect(await screen.findByText("English")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/english created/i);
  });

  it("CL4: language dropdown 'none' sends language: null", async () => {
    const createCourse = vi.fn().mockResolvedValue({
      id: "c-3",
      user_id: "u-lex",
      year_id: "y-2025",
      name: "Geo",
      emoji: "🌍",
      color: "#2563eb",
      language: null,
      default_mode: "ask",
      created_at: "2026-04-22T00:00:00Z",
    });
    const user = userEvent.setup();
    setup({ createCourse });

    await screen.findByText("French");
    await user.click(screen.getByRole("button", { name: /new course/i }));

    await user.type(screen.getByLabelText(/^name$/i), "Geo");
    await user.type(screen.getByLabelText(/^emoji$/i), "🌍");
    await user.selectOptions(screen.getByLabelText(/^language$/i), "none");
    await user.click(screen.getByRole("button", { name: /create course/i }));

    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ language: null }),
    );
  });

  it("CL5: edit → updateCourse with changed name", async () => {
    const updateCourse = vi.fn().mockResolvedValue({
      ...SEED_COURSES[0],
      name: "French Advanced",
    });
    const user = userEvent.setup();
    setup({ updateCourse });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /edit/i }));

    const nameInput = within(card).getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "French Advanced");
    await user.click(within(card).getByRole("button", { name: /^save$/i }));

    expect(updateCourse).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ name: "French Advanced" }),
    );
    expect(await screen.findByText("French Advanced")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /french advanced updated/i,
    );
  });

  it("CL6: delete after confirmation removes the course", async () => {
    const deleteCourse = vi.fn().mockResolvedValue(undefined);
    const confirmFn = vi.fn().mockReturnValue(true);
    const user = userEvent.setup();
    setup({ deleteCourse, confirmFn });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /delete/i }));

    expect(confirmFn).toHaveBeenCalled();
    expect(deleteCourse).toHaveBeenCalledWith("c-1");
    expect(screen.queryByText("French")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent(/french deleted/i);
  });

  it("CL6b: delete is skipped when confirmation is cancelled", async () => {
    const deleteCourse = vi.fn();
    const confirmFn = vi.fn().mockReturnValue(false);
    const user = userEvent.setup();
    setup({ deleteCourse, confirmFn });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /delete/i }));

    expect(deleteCourse).not.toHaveBeenCalled();
    expect(screen.getByText("French")).toBeInTheDocument();
  });

  it("CL7: shows an error alert when createCourse fails", async () => {
    const createCourse = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    setup({ createCourse });

    await screen.findByText("French");
    await user.click(screen.getByRole("button", { name: /new course/i }));
    await user.type(screen.getByLabelText(/^name$/i), "Bad");
    await user.type(screen.getByLabelText(/^emoji$/i), "💣");
    await user.click(screen.getByRole("button", { name: /create course/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CL8: renders in Dutch under lang=nl", async () => {
    setup({ lang: "nl" });
    expect(
      await screen.findByRole("heading", { name: /mijn vakken/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /nieuw vak/i }),
    ).toBeInTheDocument();
  });

  it("CL-cancel: cancel edit dismisses the form without calling updateCourse", async () => {
    const updateCourse = vi.fn();
    const user = userEvent.setup();
    setup({ updateCourse });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /edit/i }));
    await user.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(updateCourse).not.toHaveBeenCalled();
    expect(screen.getByText("French")).toBeInTheDocument();
  });

  it("CL-edit-fields: edit form language and mode changes are submitted", async () => {
    const updateCourse = vi.fn().mockResolvedValue({
      ...SEED_COURSES[0],
      language: "nl-BE",
      default_mode: "self_grade",
    });
    const user = userEvent.setup();
    setup({ updateCourse });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /edit/i }));

    await user.selectOptions(within(card).getByLabelText(/^language$/i), "nl-BE");
    await user.selectOptions(
      within(card).getByLabelText(/^default mode$/i),
      "self_grade",
    );
    await user.click(within(card).getByRole("button", { name: /^save$/i }));

    expect(updateCourse).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ language: "nl-BE", default_mode: "self_grade" }),
    );
  });

  it("CL-new-fields: new course form color and mode changes are submitted", async () => {
    const createCourse = vi.fn().mockResolvedValue({
      id: "c-3",
      user_id: "u-lex",
      year_id: "y-2025",
      name: "History",
      emoji: "📜",
      color: "#abcdef",
      language: "fr-FR",
      default_mode: "mixed",
      created_at: "2026-04-22T00:00:00Z",
    });
    const user = userEvent.setup();
    setup({ createCourse });

    await screen.findByText("French");
    await user.click(screen.getByRole("button", { name: /new course/i }));

    await user.type(screen.getByLabelText(/^name$/i), "History");
    await user.type(screen.getByLabelText(/^emoji$/i), "📜");

    const colorInput = screen.getByLabelText(/^color$/i);
    await user.clear(colorInput);
    await user.type(colorInput, "#abcdef");

    await user.selectOptions(screen.getByLabelText(/^language$/i), "fr-FR");
    await user.selectOptions(screen.getByLabelText(/^default mode$/i), "mixed");
    await user.click(screen.getByRole("button", { name: /create course/i }));

    expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "#abcdef",
        language: "fr-FR",
        default_mode: "mixed",
      }),
    );
  });

  it("CL-update-error: shows an error alert when updateCourse fails", async () => {
    const updateCourse = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    setup({ updateCourse });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /edit/i }));
    await user.click(within(card).getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CL-delete-error: shows an error alert when deleteCourse fails", async () => {
    const deleteCourse = vi.fn().mockRejectedValue(new Error("boom"));
    const confirmFn = vi.fn().mockReturnValue(true);
    const user = userEvent.setup();
    setup({ deleteCourse, confirmFn });

    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("CL9: shows no-year message and disables New course when no current year exists", async () => {
    setup({
      fetchYears: vi.fn().mockResolvedValue([OTHER_YEAR]),
      fetchCourses: vi.fn().mockResolvedValue([]),
    });
    expect(
      await screen.findByText(/no current school year/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new course/i }),
    ).toBeDisabled();
  });

  it("CL-mp1: Study on ask-mode course links to /setup", async () => {
    setup({
      fetchCourses: vi.fn().mockResolvedValue([...SEED_COURSES, ASK_COURSE]),
    });
    await screen.findByText("Science");
    const card = cardFor("Science");
    const link = within(card).getByRole("link", { name: /study/i });
    expect(link.getAttribute("href")).toContain("/setup");
  });

  it("CL-mp2: Study on non-ask course also links to /setup", async () => {
    setup();
    await screen.findByText("French");
    const card = cardFor("French");
    const link = within(card).getByRole("link", { name: /study/i });
    expect(link.getAttribute("href")).toContain("/setup");
  });

  it("CL-enrich1: Enrich button not shown when enrichCards prop is absent", async () => {
    setup();
    await screen.findByText("French");
    expect(screen.queryByRole("button", { name: /enrich/i })).toBeNull();
  });

  it("CL-enrich2: Enrich button shown for each course when enrichCards prop is provided", async () => {
    setup({ enrichCards: vi.fn().mockResolvedValue({ enriched: 3 }) });
    await screen.findByText("French");
    const enrichBtns = screen.getAllByRole("button", { name: /enrich/i });
    expect(enrichBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("CL-enrich3: Enrich calls enrichCards with courseId and shows enriched status", async () => {
    const enrichCards = vi.fn().mockResolvedValue({ enriched: 5 });
    const user = userEvent.setup();
    setup({ enrichCards });
    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /enrich/i }));
    expect(enrichCards).toHaveBeenCalledWith({ courseId: "c-1" });
    expect(await screen.findByRole("status")).toHaveTextContent(/5/);
  });

  it("CL-enrich4: Enrich shows error alert when enrichCards fails", async () => {
    const enrichCards = vi.fn().mockRejectedValue(new Error("claude_error"));
    const user = userEvent.setup();
    setup({ enrichCards });
    await screen.findByText("French");
    const card = cardFor("French");
    await user.click(within(card).getByRole("button", { name: /enrich/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("course form shows a 'Cards study both directions' checkbox", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("French");
    await user.click(screen.getByRole("button", { name: /new course/i }));
    expect(screen.getByLabelText(/cards study both directions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cards study both directions/i)).not.toBeChecked();
  });

  it("submitting the form persists the bidirectional value", async () => {
    const user = userEvent.setup();
    const createdCourse = { ...SEED_COURSES[0], id: "c-new", name: "New", bidirectional: true };
    const createCourse = vi.fn().mockResolvedValue(createdCourse);
    setup({ createCourse });
    await screen.findByText("French");

    await user.click(screen.getByRole("button", { name: /new course/i }));
    await user.type(screen.getByRole("textbox", { name: /^name$/i }), "New");
    await user.click(screen.getByLabelText(/cards study both directions/i));
    await user.click(screen.getByRole("button", { name: /create course/i }));

    await waitFor(() => expect(createCourse).toHaveBeenCalledOnce());
    expect(createCourse.mock.calls[0][0].bidirectional).toBe(true);
  });

  it("course tiles use .card and New course button uses .btn-primary", async () => {
    setup();
    await screen.findByText("French");
    expect(cardFor("French")).toHaveClass("card");
    expect(cardFor("Math")).toHaveClass("card");
    expect(screen.getByRole("button", { name: /new course/i })).toHaveClass(
      "btn",
      "btn-primary",
    );
  });
});
