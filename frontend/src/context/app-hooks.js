import { createContext, useContext } from "react";

/**
 * The context object and its consumer hooks live outside AppContext.jsx so that file exports
 * only the provider component (react-refresh/only-export-components).
 */
export const AppContext = createContext(null);

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
