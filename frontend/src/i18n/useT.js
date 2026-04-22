import { useCallback } from "react";
import { useAppContext } from "../context/AppContext.jsx";
import { translate } from "./strings.js";

/**
 * React hook returning a `t(key, params)` function bound to the current
 * UI language from AppContext. Re-renders naturally when `lang` changes
 * because the hook reads `lang` from context.
 *
 * @returns {(key: string, params?: Record<string, string | number>) => string}
 */
export function useT() {
  const { lang } = useAppContext();
  return useCallback((key, params) => translate(lang, key, params), [lang]);
}
