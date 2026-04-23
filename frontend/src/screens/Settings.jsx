import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n/useT.js";
import { useAppContext } from "../context/AppContext.jsx";
import { patchMe as patchMeApi } from "../lib/api.js";

/** @type {ReadonlyArray<"en"|"nl">} */
const SUPPORTED_LANGS = ["en", "nl"];

/**
 * @param {{ patchMe?: typeof patchMeApi }} props
 */
export default function Settings({ patchMe = patchMeApi }) {
  const t = useT();
  const { lang, setLang, user, setUser } = useAppContext();
  const [error, setError] = useState(null);
  const autoSpeak = user?.settings?.auto_speak ?? false;

  async function onLangChange(e) {
    const next = /** @type {"en"|"nl"} */ (e.target.value);
    setError(null);
    try {
      await setLang(next);
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onAutoSpeakChange(e) {
    const next = e.target.checked;
    setError(null);
    try {
      await patchMe({ settings: { auto_speak: next } });
      setUser((u) => u ? { ...u, settings: { ...u.settings, auto_speak: next } } : u);
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

      <label>
        <input
          type="checkbox"
          id="auto-speak"
          checked={autoSpeak}
          onChange={onAutoSpeakChange}
        />
        {t("settings.autoSpeak")}
      </label>

      {error && <p role="alert">{error}</p>}

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
