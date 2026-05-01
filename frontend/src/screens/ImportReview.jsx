import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { batchCreateCards as batchCreateCardsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useAppContext } from "../context/AppContext.jsx";

/**
 * @param {{ batchCreateCards?: typeof batchCreateCardsApi }} props
 */
export default function ImportReview({ batchCreateCards = batchCreateCardsApi }) {
  const t = useT();
  const { user } = useAppContext();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { candidates = [], courseName = "", courseLang = null, uploadId = null, uploadName: existingUploadName = null, skippedSlides = null } = location.state ?? {};

  const [cards, setCards] = useState(candidates);
  const [checked, setChecked] = useState(() =>
    Object.fromEntries(candidates.map((_, i) => [i, true])),
  );
  const defaultBidir = Boolean(courseLang && user?.ui_language && courseLang !== user.ui_language);
  const [bidirectional, setBidirectional] = useState(defaultBidir);
  const [uploadName, setUploadName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const appendingToExisting = Boolean(uploadId);

  function toggleCard(idx) {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function swapCard(idx) {
    setCards((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, question: c.answer, answer: c.question } : c,
      ),
    );
  }

  async function handleSave() {
    const selected = cards.filter((_, i) => checked[i]);
    if (selected.length === 0) {
      setError(t("review.noneSelected"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body = {
        courseId,
        bidirectional,
        cards: selected.map((c) => ({
          question: c.question,
          answer: c.answer,
          distractors: c.distractors ?? [],
          question_lang: c.question_lang ?? null,
          answer_lang: c.answer_lang ?? null,
        })),
      };
      if (appendingToExisting) {
        body.uploadId = uploadId;
      } else if (uploadName.trim()) {
        body.uploadName = uploadName.trim();
      }
      await batchCreateCards(body);
      navigate(`/courses/${courseId}/cards`);
    } catch {
      setError(t("import.error.generic"));
    } finally {
      setSaving(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <main>
        <h1>{t("review.title")}</h1>
        <p>{t("review.empty")}</p>
        <Link to={`/courses/${courseId}/import`} state={location.state}>
          {t("review.back")}
        </Link>
      </main>
    );
  }

  return (
    <main>
      <h1>{t("review.title")}</h1>
      <Link to={`/courses/${courseId}/import`} state={location.state}>
        {t("review.back")}
      </Link>

      {skippedSlides?.length > 0 && (
        <p data-testid="skipped-slides-notice" role="status">
          {t("review.skippedSlides", { indices: skippedSlides.join(", ") })}
        </p>
      )}

      <label>
        <input
          type="checkbox"
          checked={bidirectional}
          onChange={(e) => setBidirectional(e.target.checked)}
        />
        {t("review.bidirectional")}
      </label>

      {appendingToExisting ? (
        <p className="upload-target-note" data-testid="upload-target-note">
          {t("review.appendingTo", { name: existingUploadName ?? uploadId })}
        </p>
      ) : (
        <label>
          {t("review.uploadName")}
          <input
            type="text"
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder={t("review.uploadName.placeholder")}
          />
        </label>
      )}

      <ul>
        {cards.map((card, idx) => (
          <li key={idx}>
            <label>
              <input
                type="checkbox"
                checked={/* v8 ignore next */ checked[idx] ?? true}
                onChange={() => toggleCard(idx)}
              />
              <strong>{card.question}</strong>
              {" → "}
              {card.answer}
              {card.distractors?.length > 0 && (
                <span> [{card.distractors.join(", ")}]</span>
              )}
            </label>
            <button
              type="button"
              aria-label={t("review.action.swap")}
              onClick={() => swapCard(idx)}
            >🔄</button>
          </li>
        ))}
      </ul>

      {error && <p role="alert">{error}</p>}

      <button onClick={handleSave} disabled={saving}>
        {saving ? t("review.saving") : t("review.save")}
      </button>
    </main>
  );
}
