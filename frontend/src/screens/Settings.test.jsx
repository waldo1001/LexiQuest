import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("combobox")).toHaveValue("en");
  });

  it("pre-selects the current language — nl", () => {
    setup({ lang: "nl" });
    expect(screen.getByRole("combobox")).toHaveValue("nl");
  });

  it("calls setLang when the user picks a different language", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
    setup({ lang: "en", patchMe });
    await user.selectOptions(screen.getByRole("combobox"), "nl");
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
  });

  it("shows an error message when setLang fails", async () => {
    const user = userEvent.setup();
    const patchMe = vi.fn().mockRejectedValue(new Error("offline"));
    setup({ lang: "en", patchMe });
    await user.selectOptions(screen.getByRole("combobox"), "nl");
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
});
