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
  const { lang, setLang, user, setUser, darkMode, setDarkMode } = useAppContext();
  const [error, setError] = useState(null);
  const autoSpeak = user?.settings?.auto_speak ?? false;
  const dailyGoal = user?.settings?.daily_goal ?? 20;
  const preferredMode = user?.settings?.preferred_mode ?? "self_grade";
  const freezeTokens = user?.settings?.freeze_tokens ?? 0;

  async function onLangChange(e) {
    const next = /** @type {"en"|"nl"} */ (e.target.value);
    setError(null);
    try {
      await setLang(next);
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDailyGoalBlur(e) {
    const next = parseInt(e.target.value, 10);
    if (isNaN(next) || next < 1) return;
    setError(null);
    try {
      await patchMe({ settings: { daily_goal: next } });
      setUser((u) => u ? { ...u, settings: { ...u.settings, daily_goal: next } } : u);
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onPreferredModeChange(e) {
    const next = e.target.value;
    setError(null);
    try {
      await patchMe({ settings: { preferred_mode: next } });
      setUser((u) => u ? { ...u, settings: { ...u.settings, preferred_mode: next } } : u);
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
      <select id="lang-select" data-testid="lang-select" value={lang} onChange={onLangChange}>
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

      <label htmlFor="daily-goal-input">{t("settings.dailyGoal")}</label>
      <input
        id="daily-goal-input"
        data-testid="daily-goal-input"
        type="number"
        min="1"
        max="200"
        defaultValue={dailyGoal}
        onBlur={onDailyGoalBlur}
      />

      <label htmlFor="preferred-mode-select">{t("settings.preferredMode")}</label>
      <select
        id="preferred-mode-select"
        data-testid="preferred-mode-select"
        value={preferredMode}
        onChange={onPreferredModeChange}
      >
        <option value="self_grade">{t("courses.mode.self_grade")}</option>
        <option value="mcq">{t("courses.mode.mcq")}</option>
        <option value="mixed">{t("courses.mode.mixed")}</option>
      </select>

      <div>
        <span>{t("settings.freezeTokens")}: </span>
        <span data-testid="freeze-tokens">{freezeTokens}</span>
      </div>

      <label htmlFor="dark-mode-select">{t("settings.darkMode")}</label>
      <select
        id="dark-mode-select"
        data-testid="dark-mode-select"
        value={darkMode}
        onChange={(e) => setDarkMode(e.target.value)}
      >
        <option value="system">{t("settings.darkMode.system")}</option>
        <option value="light">{t("settings.darkMode.light")}</option>
        <option value="dark">{t("settings.darkMode.dark")}</option>
      </select>

      <a href="/api/export" download data-testid="export-link">
        {t("settings.exportData")}
      </a>

      {error && <p role="alert">{error}</p>}

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
