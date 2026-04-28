import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import Settings from "./Settings.jsx";
import { AppProvider } from "../context/AppContext.jsx";

/**
 * @param {{ lang?: "en"|"nl", patchMe?: Function, initialUser?: object|null }} [opts]
 */
function setup({ lang = "en", patchMe, initialUser = null } = {}) {
  const providerProps = { initialLang: lang, initialUser };
  if (patchMe) providerProps.patchMe = patchMe;
  const settingsPatchMe = patchMe ?? vi.fn().mockResolvedValue({});
  return render(
    <AppProvider {...providerProps}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings patchMe={settingsPatchMe} />} />
          <Route path="/home" element={<h1>Home</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
}

describe("Settings", () => {
  it("renders the settings heading", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it("renders the settings heading in Dutch under lang=nl", () => {
    setup({ lang: "nl" });
    expect(
      screen.getByRole("heading", { name: /instellingen/i }),
    ).toBeInTheDocument();
  });

  it("pre-selects the current language — en", () => {
    setup({ lang: "en" });
    expect(screen.getByTestId("lang-select")).toHaveValue("en");
  });

  it("pre-selects the current language — nl", () => {
    setup({ lang: "nl" });
    expect(screen.getByTestId("lang-select")).toHaveValue("nl");
  });

  it("calls setLang when the user picks a different language", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
    setup({ lang: "en", patchMe });
    await user.selectOptions(screen.getByTestId("lang-select"), "nl");
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
  });

  it("shows an error message when setLang fails", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockRejectedValue(new Error("offline"));
    setup({ lang: "en", patchMe });
    await user.selectOptions(screen.getByTestId("lang-select"), "nl");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("has a back link to /home", async () => {
    const user = userEvent.setup();
    setup();
    const link = screen.getByRole("link", { name: /back/i });
    expect(link).toBeInTheDocument();
    await user.click(link);
    expect(await screen.findByRole("heading", { name: /home/i })).toBeInTheDocument();
  });

  it("renders the auto-speak checkbox (AC1)", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: /auto-speak/i })).toBeInTheDocument();
  });

  it("checkbox reflects user.settings.auto_speak = true (AC2)", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: { auto_speak: true } } });
    expect(screen.getByRole("checkbox", { name: /auto-speak/i })).toBeChecked();
  });

  it("checkbox is unchecked when auto_speak not set (AC2)", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: {} } });
    expect(screen.getByRole("checkbox", { name: /auto-speak/i })).not.toBeChecked();
  });

  it("toggling checkbox calls patchMe with settings.auto_speak (AC3)", async () => {
    const patchMe = vi.fn().mockResolvedValue({});
    setup({ patchMe, initialUser: { id: "u1", name: "Lex", settings: { auto_speak: false } } });
    await userEvent.click(screen.getByRole("checkbox", { name: /auto-speak/i }));
    expect(patchMe).toHaveBeenCalledWith({ settings: { auto_speak: true } });
  });

  it("ST-ext-1: renders daily_goal input with current value from user.settings", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: { daily_goal: 15 } } });
    const input = screen.getByTestId("daily-goal-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(15);
  });

  it("ST-ext-2: changing daily_goal calls patchMe with settings.daily_goal on blur", async () => {
    const patchMe = vi.fn().mockResolvedValue({});
    setup({ patchMe, initialUser: { id: "u1", name: "Lex", settings: { daily_goal: 10 } } });
    const input = screen.getByTestId("daily-goal-input");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(patchMe).toHaveBeenCalledWith({ settings: { daily_goal: 25 } }));
  });

  it("ST-ext-3: renders preferred_mode select with current value", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: { preferred_mode: "mcq" } } });
    const select = screen.getByTestId("preferred-mode-select");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("mcq");
  });

  it("ST-ext-4: changing preferred_mode calls patchMe with settings.preferred_mode", async () => {
    const patchMe = vi.fn().mockResolvedValue({});
    setup({ patchMe, initialUser: { id: "u1", name: "Lex", settings: { preferred_mode: "self_grade" } } });
    const select = screen.getByTestId("preferred-mode-select");
    await userEvent.selectOptions(select, "mixed");
    expect(patchMe).toHaveBeenCalledWith({ settings: { preferred_mode: "mixed" } });
  });

  it("ST-ext-5: shows freeze tokens from user.settings", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: { freeze_tokens: 3 } } });
    expect(screen.getByTestId("freeze-tokens")).toHaveTextContent("3");
  });

  it("EX-UI-1: renders an export data link", () => {
    setup();
    expect(screen.getByTestId("export-link")).toBeInTheDocument();
  });

  it("EX-UI-2: export link points to /api/export and has download attribute", () => {
    setup();
    const link = screen.getByTestId("export-link");
    expect(link).toHaveAttribute("href", "/api/export");
    expect(link).toHaveAttribute("download");
  });

  it("DM-ST-1: renders a dark mode select", () => {
    setup();
    expect(screen.getByTestId("dark-mode-select")).toBeInTheDocument();
  });

  it("DM-ST-2: changing dark mode select calls setDarkMode", async () => {
    const user = userEvent.setup();
    setup();
    const select = screen.getByTestId("dark-mode-select");
    await user.selectOptions(select, "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("changing theme calls patchMe with settings.theme and updates context", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue({});
    setup({ patchMe });
    patchMe.mockClear();
    const select = screen.getByTestId("theme-select");
    await user.selectOptions(select, "arcade");
    expect(patchMe).toHaveBeenCalledWith({ settings: { theme: "arcade" } });
    expect(document.documentElement.getAttribute("data-theme-name")).toBe("arcade");
  });

  it("SF-1: renders a study font size select", () => {
    setup();
    expect(screen.getByTestId("study-font-size-select")).toBeInTheDocument();
  });

  it("SF-2: pre-selects 'normal' when study_font_size is not set", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: {} } });
    expect(screen.getByTestId("study-font-size-select")).toHaveValue("normal");
  });

  it("SF-3: pre-selects the value from user.settings.study_font_size", () => {
    setup({ initialUser: { id: "u1", name: "Lex", settings: { study_font_size: "xlarge" } } });
    expect(screen.getByTestId("study-font-size-select")).toHaveValue("xlarge");
  });

  it("SF-4: changing font size calls patchMe with settings.study_font_size", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue({});
    setup({ patchMe, initialUser: { id: "u1", name: "Lex", settings: { study_font_size: "normal" } } });
    await user.selectOptions(screen.getByTestId("study-font-size-select"), "large");
    expect(patchMe).toHaveBeenCalledWith({ settings: { study_font_size: "large" } });
  });
});
