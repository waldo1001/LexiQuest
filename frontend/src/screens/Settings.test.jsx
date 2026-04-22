import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import Settings from "./Settings.jsx";
import { AppProvider } from "../context/AppContext.jsx";

/**
 * @param {{ lang?: "en"|"nl", patchMe?: Function }} [opts]
 */
function setup({ lang = "en", patchMe } = {}) {
  const providerProps = { initialLang: lang };
  if (patchMe) providerProps.patchMe = patchMe;
  return render(
    <AppProvider {...providerProps}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
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
});
