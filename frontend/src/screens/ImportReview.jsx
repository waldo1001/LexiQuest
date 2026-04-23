import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { batchCreateCards as batchCreateCardsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

/**
 * @param {{ batchCreateCards?: typeof batchCreateCardsApi }} props
 */
export default function ImportReview({ batchCreateCards = batchCreateCardsApi }) {
  const t = useT();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { candidates = [], courseName = "" } = location.state ?? {};

  const [checked, setChecked] = useState(() =>
    Object.fromEntries(candidates.map((_, i) => [i, true])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function toggleCard(idx) {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  async function handleSave() {
    const selected = candidates.filter((_, i) => checked[i]);
    if (selected.length === 0) {
      setError(t("review.noneSelected"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await batchCreateCards({
        courseId,
        cards: selected.map((c) => ({
          question: c.question,
          answer: c.answer,
          distractors: c.distractors ?? [],
        })),
      });
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

      <ul>
        {candidates.map((card, idx) => (
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
