import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import AdminPanel from "./AdminPanel.jsx";
import { AppProvider } from "../context/AppContext.jsx";

const SEED_YEARS = [
  {
    id: "y-2025",
    label: "2025-2026",
    is_current: true,
    start_date: "2025-09-01",
    end_date: "2026-06-30",
  },
  {
    id: "y-2024",
    label: "2024-2025",
    is_current: false,
    start_date: "2024-09-01",
    end_date: "2025-06-30",
  },
];

const SEED_USERS = [
  {
    id: "u-alice",
    name: "Alice",
    isAdmin: true,
    color: "#ff0000",
    avatar_emoji: "🦊",
    ui_language: "nl",
    settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 20 },
    created_at: "2026-04-22T00:00:00Z",
  },
  {
    id: "u-bob",
    name: "Bob",
    isAdmin: false,
    color: "#00ff00",
    avatar_emoji: "🐯",
    ui_language: "nl",
    settings: { auto_speak: false, preferred_mode: "self_grade", daily_goal: 10 },
    created_at: "2026-04-22T00:00:00Z",
  },
];

function setup({
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchYears,
  createYear,
  updateYear,
  promptFn,
  confirmFn,
  lang = "en",
  currentUserId = "u-alice",
} = {}) {
  return render(
    <AppProvider initialLang={lang}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminPanel
                currentUserId={currentUserId}
                fetchUsers={fetchUsers ?? vi.fn().mockResolvedValue(SEED_USERS)}
                createUser={createUser ?? vi.fn()}
                updateUser={updateUser ?? vi.fn()}
                deleteUser={deleteUser ?? vi.fn()}
                fetchYears={fetchYears ?? vi.fn().mockResolvedValue(SEED_YEARS)}
                createYear={createYear ?? vi.fn()}
                updateYear={updateYear ?? vi.fn()}
                promptFn={promptFn ?? vi.fn(() => null)}
                confirmFn={confirmFn ?? vi.fn(() => false)}
              />
            }
          />
          <Route path="/home" element={<h1>Home</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

function rowFor(name) {
  const cell = screen.getByRole("cell", { name });
  return cell.closest("tr");
}

describe("AdminPanel", () => {
  it("lists users sorted by name", async () => {
    setup({
      fetchUsers: vi
        .fn()
        .mockResolvedValue([SEED_USERS[1], SEED_USERS[0]]),
    });
    const rows = await screen.findAllByRole("row");
    // rows[0] = header; first data row is Alice
    expect(within(rows[1]).getByText("Alice")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Bob")).toBeInTheDocument();
  });

  it("shows a loading state initially", () => {
    setup({ fetchUsers: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
  });

  it("shows an error when load fails", async () => {
    setup({
      fetchUsers: vi.fn().mockRejectedValue(new Error("boom")),
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("creates a new user via the form and appends to the list", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "u-zoe",
      name: "Zoe",
      isAdmin: false,
      color: "#2563eb",
      avatar_emoji: "🙂",
      ui_language: "nl",
      settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 20 },
      created_at: "2026-04-22T09:00:00Z",
    });
    const user = userEvent.setup();
    setup({ createUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    await user.type(screen.getByLabelText(/^name$/i), "Zoe");
    await user.type(screen.getByLabelText(/^password$/i), "secret1");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Zoe", password: "secret1" }),
    );
    expect(await screen.findByText("Zoe")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /created zoe/i,
    );
  });

  it("new-user form submits color / avatar / is_admin / ui_language", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "u-zoe",
      name: "Zoe",
      isAdmin: true,
      color: "#abcdef",
      avatar_emoji: "🐼",
      ui_language: "en",
      settings: { auto_speak: true, preferred_mode: "ask", daily_goal: 20 },
      created_at: "2026-04-22T09:00:00Z",
    });
    const user = userEvent.setup();
    setup({ createUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    await user.type(screen.getByLabelText(/^name$/i), "Zoe");
    await user.type(screen.getByLabelText(/^password$/i), "secret1");

    const color = screen.getByLabelText(/^color$/i);
    await user.clear(color);
    await user.type(color, "#abcdef");

    const avatar = screen.getByLabelText(/^emoji$/i);
    await user.clear(avatar);
    await user.type(avatar, "🐼");

    await user.click(screen.getByLabelText(/^admin$/i));
    await user.selectOptions(screen.getByLabelText(/^language$/i), "en");

    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Zoe",
        password: "secret1",
        color: "#abcdef",
        avatar_emoji: "🐼",
        is_admin: true,
        ui_language: "en",
      }),
    );
  });

  it("surfaces an error alert when create fails", async () => {
    const user = userEvent.setup();
    setup({
      createUser: vi.fn().mockRejectedValue(new Error("forbidden")),
    });

    await screen.findByRole("heading", { name: /admin panel/i });
    await user.type(screen.getByLabelText(/^name$/i), "Zoe");
    await user.type(screen.getByLabelText(/^password$/i), "secret1");
    await user.click(screen.getByRole("button", { name: /create user/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("edits a user via inline form and persists via updateUser", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      ...SEED_USERS[1],
      name: "Bobby",
    });
    const user = userEvent.setup();
    setup({ updateUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /edit/i }));

    const nameInput = within(bobRow).getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Bobby");
    await user.click(within(bobRow).getByRole("button", { name: /^save$/i }));

    expect(updateUser).toHaveBeenCalledWith(
      "u-bob",
      expect.objectContaining({ name: "Bobby" }),
    );
    expect(await screen.findByText("Bobby")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /updated bobby/i,
    );
  });

  it("edit row exposes avatar / color / admin / language controls", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      ...SEED_USERS[1],
      avatar_emoji: "🐼",
      color: "#abcdef",
      isAdmin: true,
      ui_language: "en",
    });
    const user = userEvent.setup();
    setup({ updateUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /edit/i }));

    const avatar = within(bobRow).getByLabelText(/emoji/i);
    await user.clear(avatar);
    await user.type(avatar, "🐼");

    const color = within(bobRow).getByLabelText(/color/i);
    await user.clear(color);
    await user.type(color, "#abcdef");

    await user.click(within(bobRow).getByLabelText(/admin/i));
    await user.selectOptions(
      within(bobRow).getByLabelText(/language/i),
      "en",
    );
    await user.click(within(bobRow).getByRole("button", { name: /^save$/i }));

    expect(updateUser).toHaveBeenCalledWith(
      "u-bob",
      expect.objectContaining({
        avatar_emoji: "🐼",
        color: "#abcdef",
        is_admin: true,
        ui_language: "en",
      }),
    );
  });

  it("cancels edit without calling updateUser", async () => {
    const updateUser = vi.fn();
    const user = userEvent.setup();
    setup({ updateUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /edit/i }));
    await user.click(
      within(bobRow).getByRole("button", { name: /cancel/i }),
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("resets password via prompt + updateUser", async () => {
    const updateUser = vi.fn().mockResolvedValue(SEED_USERS[1]);
    const promptFn = vi.fn().mockReturnValue("fresh-pw");
    const user = userEvent.setup();
    setup({ updateUser, promptFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(
      within(bobRow).getByRole("button", { name: /reset password/i }),
    );

    expect(promptFn).toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith("u-bob", {
      password: "fresh-pw",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /password reset for bob/i,
    );
  });

  it("does nothing when password prompt is cancelled", async () => {
    const updateUser = vi.fn();
    const promptFn = vi.fn().mockReturnValue(null);
    const user = userEvent.setup();
    setup({ updateUser, promptFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(
      within(bobRow).getByRole("button", { name: /reset password/i }),
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("deletes a user after confirmation", async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const confirmFn = vi.fn().mockReturnValue(true);
    const user = userEvent.setup();
    setup({ deleteUser, confirmFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /delete/i }));

    expect(deleteUser).toHaveBeenCalledWith("u-bob");
    // Row is gone
    expect(screen.queryByText("Bob")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /deleted bob/i,
    );
  });

  it("does nothing when delete is not confirmed", async () => {
    const deleteUser = vi.fn();
    const confirmFn = vi.fn().mockReturnValue(false);
    const user = userEvent.setup();
    setup({ deleteUser, confirmFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /delete/i }));
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("hides the delete button for the current admin's own row", async () => {
    setup({ currentUserId: "u-alice" });

    await screen.findByRole("heading", { name: /admin panel/i });
    const aliceRow = rowFor("Alice");
    expect(
      within(aliceRow).queryByRole("button", { name: /delete/i }),
    ).toBeNull();
    const bobRow = rowFor("Bob");
    expect(
      within(bobRow).getByRole("button", { name: /delete/i }),
    ).toBeInTheDocument();
  });

  it("renders in Dutch under lang=nl", async () => {
    setup({ lang: "nl" });
    expect(
      await screen.findByRole("heading", { name: /beheerpaneel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /gebruiker aanmaken/i }),
    ).toBeInTheDocument();
  });

  it("surfaces an error when update fails", async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    setup({ updateUser });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /edit/i }));
    await user.click(within(bobRow).getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("surfaces an error when delete fails", async () => {
    const deleteUser = vi.fn().mockRejectedValue(new Error("boom"));
    const confirmFn = vi.fn().mockReturnValue(true);
    const user = userEvent.setup();
    setup({ deleteUser, confirmFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(within(bobRow).getByRole("button", { name: /delete/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("surfaces an error when password reset fails", async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error("boom"));
    const promptFn = vi.fn().mockReturnValue("fresh-pw");
    const user = userEvent.setup();
    setup({ updateUser, promptFn });

    await screen.findByRole("heading", { name: /admin panel/i });
    const bobRow = rowFor("Bob");
    await user.click(
      within(bobRow).getByRole("button", { name: /reset password/i }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("has a back link to /home", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("heading", { name: /admin panel/i });
    await user.click(screen.getByRole("link", { name: /back/i }));
    expect(
      await screen.findByRole("heading", { name: /home/i }),
    ).toBeInTheDocument();
  });
});

describe("AdminPanel — Years", () => {
  it("AP-Y1: renders the School years section listing years", async () => {
    setup();
    expect(
      await screen.findByRole("heading", { name: /school years/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("2025-2026")).toBeInTheDocument();
    expect(screen.getByText("2024-2025")).toBeInTheDocument();
  });

  it("AP-Y2: creates a new year via the form", async () => {
    const createYear = vi.fn().mockResolvedValue({
      id: "y-2026",
      label: "2026-2027",
      is_current: false,
      start_date: "2026-09-01",
      end_date: "2027-06-30",
    });
    const user = userEvent.setup();
    setup({ createYear });

    await screen.findByRole("heading", { name: /school years/i });
    await user.type(screen.getByLabelText(/^label$/i), "2026-2027");
    await user.type(screen.getByLabelText(/^start$/i), "2026-09-01");
    await user.type(screen.getByLabelText(/^end$/i), "2027-06-30");
    await user.click(screen.getByRole("button", { name: /create year/i }));

    expect(createYear).toHaveBeenCalledWith(
      expect.objectContaining({ label: "2026-2027" }),
    );
    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /year 2026-2027 created/i,
    );
  });

  it("AP-Y3: Set current calls updateYear with is_current:true", async () => {
    const updateYear = vi.fn().mockResolvedValue({
      ...SEED_YEARS[1],
      is_current: true,
    });
    const user = userEvent.setup();
    setup({ updateYear });

    await screen.findByRole("heading", { name: /school years/i });

    const cell = screen.getByText("2024-2025");
    const row = cell.closest("tr");
    await user.click(
      within(row).getByRole("button", { name: /set current/i }),
    );

    expect(updateYear).toHaveBeenCalledWith(
      "y-2024",
      expect.objectContaining({ is_current: true }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /2024-2025 is now the current year/i,
    );
  });

  it("AP-Y4: edits a year label inline and calls updateYear", async () => {
    const updateYear = vi.fn().mockResolvedValue({
      ...SEED_YEARS[0],
      label: "2025-2026 (edited)",
    });
    const user = userEvent.setup();
    setup({ updateYear });

    await screen.findByRole("heading", { name: /school years/i });
    const cell = screen.getByText("2025-2026");
    const row = cell.closest("tr");
    await user.click(within(row).getByRole("button", { name: /edit/i }));

    const labelInput = within(row).getByLabelText(/^label$/i);
    await user.clear(labelInput);
    await user.type(labelInput, "2025-2026 (edited)");
    await user.click(within(row).getByRole("button", { name: /^save$/i }));

    expect(updateYear).toHaveBeenCalledWith(
      "y-2025",
      expect.objectContaining({ label: "2025-2026 (edited)" }),
    );
    expect(await screen.findByText("2025-2026 (edited)")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /year 2025-2026 \(edited\) updated/i,
    );
  });
});
