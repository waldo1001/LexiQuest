import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { importCards as importCardsApi, fetchCards as fetchCardsApi } from "../lib/api.js";
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
 * @param {{ importCards?: typeof importCardsApi, fetchCards?: typeof fetchCardsApi }} props
 */
export default function PhotoImport({ importCards = importCardsApi, fetchCards = fetchCardsApi }) {
  const t = useT();
  const { lang: uiLang } = useAppContext();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseName = "", ownerId = null, courseLang = null, questionLangDefault = null, answerLangDefault = null, uploadId: initialUploadId = null } = location.state ?? {};

  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [questionLang, setQuestionLang] = useState(() => courseLang ? (questionLangDefault ?? baseTag(uiLang)) : "");
  const [answerLang, setAnswerLang] = useState(() => courseLang ? (answerLangDefault ?? baseTag(uiLang)) : "");
  const [existingUploads, setExistingUploads] = useState([]);
  const [selectedUploadId, setSelectedUploadId] = useState(initialUploadId ?? "");

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetchCards(courseId)
      .then((cards) => {
        if (cancelled) return;
        const seen = new Map();
        for (const c of cards) {
          if (c.upload_id && !seen.has(c.upload_id)) {
            seen.set(c.upload_id, c.upload_name ?? null);
          } else if (c.upload_id && c.upload_name && !seen.get(c.upload_id)) {
            seen.set(c.upload_id, c.upload_name);
          }
        }
        const list = [...seen.entries()].map(([id, name]) => ({ uploadId: id, uploadName: name }));
        setExistingUploads(list);
      })
      /* v8 ignore next 3 */
      .catch(() => {
        if (!cancelled) setExistingUploads([]);
      });
    return () => { cancelled = true; };
  }, [courseId, fetchCards]);

  const selectedUploadName = useMemo(() => {
    if (!selectedUploadId) return null;
    const hit = existingUploads.find((u) => u.uploadId === selectedUploadId);
    return hit?.uploadName ?? null;
  }, [existingUploads, selectedUploadId]);

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
          uploadId: selectedUploadId || null,
          uploadName: selectedUploadName,
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

      {existingUploads.length > 0 && (
        <div>
          <label>
            {t("import.addToUpload")}
            <select
              aria-label={t("import.addToUpload")}
              value={selectedUploadId}
              onChange={(e) => setSelectedUploadId(e.target.value)}
            >
              <option value="">{t("import.newUpload")}</option>
              {existingUploads.map((u) => (
                <option key={u.uploadId} value={u.uploadId}>
                  {u.uploadName ?? u.uploadId}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

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
