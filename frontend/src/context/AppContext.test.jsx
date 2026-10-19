import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AppProvider } from "./AppContext.jsx";
import { useAppContext, useTts } from "./app-hooks.js";
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

  it("falls back to the default theme when initialTheme is unknown", () => {
    function ThemeProbe() {
      const { themeName } = useAppContext();
      return <div data-testid="theme">{themeName}</div>;
    }
    render(
      <AppProvider initialTheme="not-a-real-theme">
        <ThemeProbe />
      </AppProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("playful");
  });

  it("setThemeName coerces an unknown theme to the default before persisting", async () => {
    const patchMe = vi.fn().mockResolvedValue({});
    function ThemeCaller() {
      const { setThemeName } = useAppContext();
      return (
        <button type="button" onClick={() => setThemeName("bogus")}>
          bad-theme
        </button>
      );
    }
    render(
      <AppProvider patchMe={patchMe}>
        <ThemeCaller />
      </AppProvider>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "bad-theme" }).click();
    });
    expect(patchMe).toHaveBeenCalledWith({ settings: { theme: "playful" } });
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

    it("syncs themeName from user.settings.theme on login", async () => {
      const patchMe = vi.fn().mockResolvedValue({});
      const userWithTheme = { id: "u1", name: "Lex", isAdmin: false, settings: { theme: "arcade" } };
      render(
        <AppProvider patchMe={patchMe} initialUser={userWithTheme}>
          <ThemeProbe />
        </AppProvider>,
      );
      // The useEffect on user should sync the theme
      expect(screen.getByTestId("theme-name").textContent).toBe("arcade");
    });

    it("theme follows user.settings.theme on login and the manual override until the user changes", async () => {
      const patchMe = vi.fn().mockResolvedValue({});
      function Switcher() {
        const { setUser } = useAppContext();
        return (
          <div>
            <button type="button" onClick={() => setUser({ id: "u2", settings: { theme: "classic" } })}>login-classic</button>
            <button type="button" onClick={() => setUser({ id: "u3", settings: { theme: "bogus" } })}>login-bogus</button>
          </div>
        );
      }
      const theme = () => screen.getByTestId("theme-name").textContent;
      const click = (name) => act(async () => { screen.getByRole("button", { name }).click(); });
      render(
        <AppProvider patchMe={patchMe} initialUser={{ id: "u1", settings: { theme: "arcade" } }}>
          <ThemeProbe />
          <Switcher />
        </AppProvider>,
      );
      expect(theme()).toBe("arcade");

      await click("to-playful");
      expect(theme()).toBe("playful"); // the manual override wins over settings.theme

      await click("login-classic");
      expect(theme()).toBe("classic"); // a user change resets the override

      await click("to-arcade");
      expect(theme()).toBe("arcade");

      await click("login-bogus");
      expect(theme()).toBe("playful"); // unknown theme in settings is ignored (default)
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
