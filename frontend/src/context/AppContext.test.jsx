import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AppProvider, useAppContext, useTts } from "./AppContext.jsx";
import { createFakeTts } from "../testing/fake-tts.js";

function Probe() {
  const { user, lang, setLang, setUser } = useAppContext();
  return (
    <div>
      <div data-testid="lang">{lang}</div>
      <div data-testid="user-name">{user ? user.name : "none"}</div>
      <button type="button" onClick={() => setLang("nl")}>to-nl</button>
      <button type="button" onClick={() => setUser({ name: "Lex" })}>set-user</button>
    </div>
  );
}

describe("AppContext", () => {
  it("throws a helpful error when used outside an AppProvider", () => {
    const prevError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(
        /useAppContext must be used within an AppProvider/,
      );
    } finally {
      console.error = prevError;
    }
  });

  it("defaults lang to 'en' when no initialLang prop is supplied", () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("honours the initialLang prop", () => {
    render(
      <AppProvider initialLang="nl">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("setLang calls patchMe and updates lang on resolve", async () => {
    const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
    render(
      <AppProvider initialLang="en" patchMe={patchMe}>
        <Probe />
      </AppProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("does not update lang when patchMe rejects", async () => {
    const patchMe = vi.fn().mockRejectedValue(new Error("offline"));
    function Caller() {
      const { lang, setLang } = useAppContext();
      async function onClick() {
        try {
          await setLang("nl");
        } catch {
          /* swallow — UI-level handling is Slice 3 */
        }
      }
      return (
        <div>
          <div data-testid="lang">{lang}</div>
          <button type="button" onClick={onClick}>to-nl</button>
        </div>
      );
    }
    render(
      <AppProvider initialLang="en" patchMe={patchMe}>
        <Caller />
      </AppProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "to-nl" }).click();
    });
    expect(patchMe).toHaveBeenCalledWith({ ui_language: "nl" });
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("mounts without a patchMe prop (uses default binding)", () => {
    render(
      <AppProvider initialLang="en">
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("setUser updates the exposed user value", () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    expect(screen.getByTestId("user-name").textContent).toBe("none");
    act(() => {
      screen.getByRole("button", { name: "set-user" }).click();
    });
    expect(screen.getByTestId("user-name").textContent).toBe("Lex");
  });

  describe("<html lang> sync", () => {
    afterEach(() => {
      document.documentElement.lang = "";
    });

    it("sets document.documentElement.lang to initialLang on mount", () => {
      render(
        <AppProvider initialLang="en">
          <Probe />
        </AppProvider>,
      );
      expect(document.documentElement.lang).toBe("en");
    });

    it("updates document.documentElement.lang when lang changes", async () => {
      const patchMe = vi.fn().mockResolvedValue({ ui_language: "nl" });
      render(
        <AppProvider initialLang="en" patchMe={patchMe}>
          <Probe />
        </AppProvider>,
      );
      await act(async () => {
        screen.getByRole("button", { name: "to-nl" }).click();
      });
      expect(document.documentElement.lang).toBe("nl");
    });
  });

  describe("useTts", () => {
    function TtsProbe() {
      const tts = useTts();
      return (
        <div>
          <div data-testid="available">{String(tts.isAvailable("fr-FR"))}</div>
          <button type="button" onClick={() => tts.speak("bonjour", "fr-FR")}>speak</button>
        </div>
      );
    }

    it("returns the tts object injected via the tts prop (AC11)", () => {
      const fakeTts = createFakeTts({ available: true });
      render(
        <AppProvider tts={fakeTts}>
          <TtsProbe />
        </AppProvider>,
      );
      expect(screen.getByTestId("available").textContent).toBe("true");
    });

    it("speak() on injected tts records the call (AC11)", () => {
      const fakeTts = createFakeTts();
      render(
        <AppProvider tts={fakeTts}>
          <TtsProbe />
        </AppProvider>,
      );
      act(() => {
        screen.getByRole("button", { name: "speak" }).click();
      });
      expect(fakeTts.lastSpoken).toEqual({ text: "bonjour", lang: "fr-FR", rate: 0.9 });
    });

    it("default no-op tts has isAvailable false and speak does nothing (AC12)", () => {
      render(
        <AppProvider>
          <TtsProbe />
        </AppProvider>,
      );
      expect(screen.getByTestId("available").textContent).toBe("false");
      expect(() =>
        act(() => {
          screen.getByRole("button", { name: "speak" }).click();
        }),
      ).not.toThrow();
    });
  });

  describe("theme", () => {
    function ThemeProbe() {
      const { themeName, setThemeName, darkMode, setDarkMode } = useAppContext();
      return (
        <div>
          <div data-testid="theme-name">{themeName ?? "none"}</div>
          <button type="button" onClick={() => setThemeName("arcade")}>to-arcade</button>
          <button type="button" onClick={() => setThemeName("playful")}>to-playful</button>
          <button type="button" onClick={() => setDarkMode("light")}>to-light</button>
          <div data-testid="dark-mode">{darkMode}</div>
        </div>
      );
    }

    afterEach(() => {
      document.documentElement.removeAttribute("data-theme-name");
      document.documentElement.removeAttribute("data-theme");
    });

    it("applies data-theme-name on documentElement when themeName is set", async () => {
      const patchMe = vi.fn().mockResolvedValue({});
      render(
        <AppProvider patchMe={patchMe}>
          <ThemeProbe />
        </AppProvider>,
      );
      expect(screen.getByTestId("theme-name").textContent).toBe("playful");
      expect(document.documentElement.getAttribute("data-theme-name")).toBe("playful");

      await act(async () => {
        screen.getByRole("button", { name: "to-arcade" }).click();
      });
      expect(document.documentElement.getAttribute("data-theme-name")).toBe("arcade");
    });

    it("setThemeName calls patchMe with settings.theme", async () => {
      const patchMe = vi.fn().mockResolvedValue({});
      render(
        <AppProvider patchMe={patchMe}>
          <ThemeProbe />
        </AppProvider>,
      );
      patchMe.mockClear();
      await act(async () => {
        screen.getByRole("button", { name: "to-arcade" }).click();
      });
      expect(patchMe).toHaveBeenCalledWith({ settings: { theme: "arcade" } });
    });

    it("arcade theme forces data-theme='dark' on documentElement", async () => {
      const patchMe = vi.fn().mockResolvedValue({});
      render(
        <AppProvider patchMe={patchMe}>
          <ThemeProbe />
        </AppProvider>,
      );
      await act(async () => {
        screen.getByRole("button", { name: "to-light" }).click();
      });
      await act(async () => {
        screen.getByRole("button", { name: "to-arcade" }).click();
      });
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      await act(async () => {
        screen.getByRole("button", { name: "to-playful" }).click();
      });
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });
});
