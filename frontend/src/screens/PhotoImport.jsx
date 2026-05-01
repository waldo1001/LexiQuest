import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  importCards as importCardsApi,
  fetchCards as fetchCardsApi,
  patchMe as patchMeApi,
} from "../lib/api.js";
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

const MAX_PRESETS = 20;
const MAX_EXTRA_INSTRUCTIONS = 1000;

function newPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  /* v8 ignore next 2 */
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip region suffix: "fr-FR" → "fr" */
function baseTag(code) {
  return code ? code.split("-")[0] : "";
}

/**
 * @param {{
 *   importCards?: typeof importCardsApi,
 *   fetchCards?: typeof fetchCardsApi,
 *   patchMe?: typeof patchMeApi,
 *   promptFn?: (msg: string, defaultValue?: string) => string | null,
 *   confirmFn?: (msg: string) => boolean,
 * }} props
 */
export default function PhotoImport({
  importCards = importCardsApi,
  fetchCards = fetchCardsApi,
  patchMe = patchMeApi,
  promptFn = typeof window !== "undefined"
    ? window.prompt.bind(window)
    /* v8 ignore next */
    : () => null,
  confirmFn = typeof window !== "undefined"
    ? window.confirm.bind(window)
    /* v8 ignore next */
    : () => false,
}) {
  const t = useT();
  const { lang: uiLang, user, setUser } = useAppContext();
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

  const presets = user?.settings?.import_instruction_presets ?? [];
  const [extraInstructions, setExtraInstructions] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetError, setPresetError] = useState(null);
  const [presetBusy, setPresetBusy] = useState(false);

  function onSelectPreset(id) {
    setSelectedPresetId(id);
    setPresetError(null);
    if (!id) return;
    const found = presets.find((p) => p.id === id);
    if (found) setExtraInstructions(found.body);
  }

  async function writePresets(next) {
    setPresetBusy(true);
    setPresetError(null);
    try {
      const updated = await patchMe({ settings: { import_instruction_presets: next } });
      setUser(updated);
    } catch {
      setPresetError(t("import.preset.error.save"));
    } finally {
      setPresetBusy(false);
    }
  }

  async function onSaveNewPreset() {
    const body = extraInstructions.trim();
    if (!body) {
      setPresetError(t("import.preset.error.empty"));
      return;
    }
    if (presets.length >= MAX_PRESETS) {
      setPresetError(t("import.preset.error.tooMany"));
      return;
    }
    const name = promptFn(t("import.preset.namePrompt"));
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setPresetError(t("import.preset.error.nameRequired"));
      return;
    }
    const id = newPresetId();
    await writePresets([...presets, { id, name: trimmedName, body }]);
    setSelectedPresetId(id);
  }

  async function onUpdatePreset() {
    if (!selectedPresetId) return;
    const body = extraInstructions.trim();
    if (!body) {
      setPresetError(t("import.preset.error.empty"));
      return;
    }
    const next = presets.map((p) =>
      p.id === selectedPresetId ? { ...p, body } : p,
    );
    await writePresets(next);
  }

  async function onDeletePreset() {
    if (!selectedPresetId) return;
    if (!confirmFn(t("import.preset.confirmDelete"))) return;
    const next = presets.filter((p) => p.id !== selectedPresetId);
    await writePresets(next);
    setSelectedPresetId("");
    setExtraInstructions("");
  }

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
      const trimmedExtra = extraInstructions.trim();
      if (trimmedExtra) payload.extraInstructions = trimmedExtra;
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
      } else if (msg === "image_too_large") {
        setError(t("import.error.tooLarge"));
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

      {presets.length > 0 && (
        <div>
          <label>
            {t("import.preset.useSaved")}
            <select
              value={selectedPresetId}
              onChange={(e) => onSelectPreset(e.target.value)}
            >
              <option value="">{t("import.preset.choose")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div>
        <label>
          {t("import.extraInstructions")}
          <textarea
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            maxLength={MAX_EXTRA_INSTRUCTIONS}
            placeholder={t("import.extraInstructions.placeholder")}
            rows={3}
          />
        </label>
        <div>
          <button type="button" onClick={onSaveNewPreset} disabled={presetBusy}>
            {t("import.preset.saveNew")}
          </button>
          <button
            type="button"
            onClick={onUpdatePreset}
            disabled={!selectedPresetId || presetBusy}
          >
            {t("import.preset.update")}
          </button>
          <button
            type="button"
            onClick={onDeletePreset}
            disabled={!selectedPresetId || presetBusy}
          >
            {t("import.preset.delete")}
          </button>
        </div>
        {presetError && <p role="alert">{presetError}</p>}
      </div>

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
