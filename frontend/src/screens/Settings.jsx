import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n/useT.js";
import { useAppContext } from "../context/AppContext.jsx";

/** @type {ReadonlyArray<"en"|"nl">} */
const SUPPORTED_LANGS = ["en", "nl"];

/**
 * Settings screen — language toggle.
 */
export default function Settings() {
  const t = useT();
  const { lang, setLang } = useAppContext();
  const [error, setError] = useState(null);

  /**
   * @param {React.ChangeEvent<HTMLSelectElement>} e
   */
  async function onLangChange(e) {
    const next = /** @type {"en"|"nl"} */ (e.target.value);
    setError(null);
    try {
      await setLang(next);
    } catch {
      setError(t("errors.generic"));
    }
  }

  return (
    <main>
      <h1>{t("settings.title")}</h1>

      <label htmlFor="lang-select">{t("settings.language")}</label>
      <select id="lang-select" value={lang} onChange={onLangChange}>
        {SUPPORTED_LANGS.map((l) => (
          <option key={l} value={l}>
            {t(`settings.language.${l}`)}
          </option>
        ))}
      </select>

      {error && <p role="alert">{error}</p>}

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
