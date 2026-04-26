import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { importCards as importCardsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useAppContext } from "../context/AppContext.jsx";

const LANG_OPTIONS = [
  { value: "", labelKey: "import.langNone" },
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

/** Strip region suffix: "fr-FR" → "fr" */
function baseTag(code) {
  return code ? code.split("-")[0] : "";
}

/**
 * @param {{ importCards?: typeof importCardsApi }} props
 */
export default function PhotoImport({ importCards = importCardsApi }) {
  const t = useT();
  const { lang: uiLang } = useAppContext();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseName = "", ownerId = null, courseLang = null, questionLangDefault = null, answerLangDefault = null } = location.state ?? {};

  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [questionLang, setQuestionLang] = useState(() => courseLang ? (questionLangDefault ?? baseTag(uiLang)) : "");
  const [answerLang, setAnswerLang] = useState(() => courseLang ? (answerLangDefault ?? baseTag(uiLang)) : "");

  async function handleExtract() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("import.error.noFile"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const base64 = await readAsBase64(file);
      /* v8 ignore next */
      const mimeType = file.type || (file.name?.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const payload = { courseId, imageBase64: base64, mimeType };
      if (courseLang) {
        payload.questionLang = questionLang;
        payload.answerLang = answerLang;
      }
      const result = await importCards(payload);

      navigate(`/courses/${courseId}/import/review`, {
        state: {
          courseId,
          courseName,
          ownerId,
          candidates: result.candidates,
        },
      });
    } catch (err) {
      /* v8 ignore next */
      const msg = err?.message ?? "";
      if (msg === "parse_error") {
        setError(t("import.error.parse"));
      } else if (msg === "claude_error") {
        setError(t("import.error.claude"));
      } else {
        setError(t("import.error.generic"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>{t("import.title")}</h1>
      <Link to={`/courses/${courseId}/cards`} state={location.state}>
        {t("review.back")}
      </Link>

      <div>
        <label>
          {t("import.pick")}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
          />
        </label>
      </div>

      {courseLang && (
        <div>
          <label>
            {t("import.questionLang")}
            <select value={questionLang} onChange={(e) => setQuestionLang(e.target.value)}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label ?? t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("import.answerLang")}
            <select value={answerLang} onChange={(e) => setAnswerLang(e.target.value)}>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label ?? t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      <button onClick={handleExtract} disabled={loading}>
        {loading ? t("import.loading") : t("import.extract")}
      </button>
    </main>
  );
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Strip the data URL prefix: "data:image/jpeg;base64,<data>"
      /* v8 ignore next */
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
