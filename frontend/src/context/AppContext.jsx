import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { patchMe as patchMeApi } from "../lib/api.js";

const AppContext = createContext(null);

const noopTts = { isAvailable: () => false, speak: () => {} };

/**
 * Root-level context holding the authenticated user, UI language, and TTS seam.
 *
 * `setLang(nextLang)` is server-first: it awaits `patchMe({ ui_language })`
 * and only updates local state on success, so a network failure never
 * desyncs the UI from the persisted preference. The PATCH call is
 * injectable via the `patchMe` prop for tests.
 *
 * `tts` defaults to a no-op so tests that don't care about TTS need no setup.
 *
 * @param {{
 *   children: React.ReactNode,
 *   initialLang?: "en"|"nl",
 *   initialUser?: object|null,
 *   patchMe?: (patch: { ui_language?: "en"|"nl", settings?: object }) => Promise<object>,
 *   tts?: { isAvailable(lang: string): boolean, speak(text: string, lang: string, rate?: number): void },
 * }} props
 */
const THEMES = ["classic", "playful", "arcade"];
const DEFAULT_THEME = "playful";

export function AppProvider({
  children,
  initialLang = "en",
  initialUser = null,
  initialTheme = DEFAULT_THEME,
  patchMe = patchMeApi,
  tts = noopTts,
}) {
  const [user, setUser] = useState(initialUser);
  const [lang, setLangState] = useState(initialLang);
  const [darkMode, setDarkModeState] = useState("system");
  const [themeName, setThemeNameState] = useState(
    THEMES.includes(initialTheme) ? initialTheme : DEFAULT_THEME,
  );

  const setLang = useCallback(
    async (next) => {
      await patchMe({ ui_language: next });
      setLangState(next);
    },
    [patchMe],
  );

  const applyDataTheme = useCallback((mode) => {
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, []);

  const setDarkMode = useCallback(
    (mode) => {
      setDarkModeState(mode);
      // arcade forces dark; defer the write until the theme effect runs.
      if (themeName !== "arcade") applyDataTheme(mode);
    },
    [themeName, applyDataTheme],
  );

  const setThemeName = useCallback(
    async (next) => {
      const safe = THEMES.includes(next) ? next : DEFAULT_THEME;
      await patchMe({ settings: { theme: safe } });
      setThemeNameState(safe);
    },
    [patchMe],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme-name", themeName);
  }, [themeName]);

  useEffect(() => {
    const t = user?.settings?.theme;
    if (t && THEMES.includes(t) && t !== themeName) {
      setThemeNameState(t);
    }
  }, [user, themeName]);

  useEffect(() => {
    if (themeName === "arcade") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      applyDataTheme(darkMode);
    }
  }, [themeName, darkMode, applyDataTheme]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      lang,
      setLang,
      tts,
      darkMode,
      setDarkMode,
      themeName,
      setThemeName,
    }),
    [user, lang, setLang, tts, darkMode, setDarkMode, themeName, setThemeName],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return ctx;
}

export function useTts() {
  return useAppContext().tts;
}
