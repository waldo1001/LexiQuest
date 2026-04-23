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
export function AppProvider({
  children,
  initialLang = "en",
  initialUser = null,
  patchMe = patchMeApi,
  tts = noopTts,
}) {
  const [user, setUser] = useState(initialUser);
  const [lang, setLangState] = useState(initialLang);
  const [darkMode, setDarkModeState] = useState("system");

  const setLang = useCallback(
    async (next) => {
      await patchMe({ ui_language: next });
      setLangState(next);
    },
    [patchMe],
  );

  const setDarkMode = useCallback((mode) => {
    setDarkModeState(mode);
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({ user, setUser, lang, setLang, tts, darkMode, setDarkMode }),
    [user, lang, setLang, tts, darkMode, setDarkMode],
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
