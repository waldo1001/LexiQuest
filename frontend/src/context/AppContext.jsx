import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { patchMe as patchMeApi } from "../lib/api.js";

const AppContext = createContext(null);

/**
 * Root-level context holding the authenticated user and UI language.
 *
 * `setLang(nextLang)` is server-first: it awaits `patchMe({ ui_language })`
 * and only updates local state on success, so a network failure never
 * desyncs the UI from the persisted preference. The PATCH call is
 * injectable via the `patchMe` prop for tests.
 *
 * @param {{
 *   children: React.ReactNode,
 *   initialLang?: "en"|"nl",
 *   initialUser?: object|null,
 *   patchMe?: (patch: { ui_language?: "en"|"nl", settings?: object }) => Promise<object>,
 * }} props
 */
export function AppProvider({
  children,
  initialLang = "en",
  initialUser = null,
  patchMe = patchMeApi,
}) {
  const [user, setUser] = useState(initialUser);
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback(
    async (next) => {
      await patchMe({ ui_language: next });
      setLangState(next);
    },
    [patchMe],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({ user, setUser, lang, setLang }),
    [user, lang, setLang],
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
