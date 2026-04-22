import { createContext, useCallback, useContext, useMemo, useState } from "react";

const AppContext = createContext(null);

/**
 * Root-level context holding the authenticated user and UI language.
 *
 * This slice keeps `setLang` as pure local state. Phase 4 Slice 2 will
 * extend it to PATCH /api/me so the preference persists on the user row.
 *
 * @param {{ children: React.ReactNode, initialLang?: "en"|"nl", initialUser?: object|null }} props
 */
export function AppProvider({ children, initialLang = "en", initialUser = null }) {
  const [user, setUser] = useState(initialUser);
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
  }, []);

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
