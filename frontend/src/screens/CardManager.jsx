import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  fetchCards as fetchCardsApi,
  createCard as createCardApi,
  updateCard as updateCardApi,
  deleteCard as deleteCardApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useAppContext, useTts } from "../context/AppContext.jsx";

const EMPTY_NEW = { question: "", answer: "", hint: "" };

/**
 * @param {{
 *   fetchCards?: typeof fetchCardsApi,
 *   createCard?: typeof createCardApi,
 *   updateCard?: typeof updateCardApi,
 *   deleteCard?: typeof deleteCardApi,
 *   confirmFn?: (msg: string) => boolean,
 * }} props
 */
export default function CardManager({
  fetchCards = fetchCardsApi,
  createCard = createCardApi,
  updateCard = updateCardApi,
  deleteCard = deleteCardApi,
  confirmFn = typeof window !== "undefined"
    ? window.confirm.bind(window)
    : () => false,
}) {
  const t = useT();
  const tts = useTts();
  const { courseId } = useParams();
  const location = useLocation();
  const { courseName = "", ownerId = null, courseLang = null } = location.state ?? {};
  const canSpeak = Boolean(courseLang && tts.isAvailable(courseLang));

  const { user } = useAppContext();
  const canEdit =
    user !== null && (user.id === ownerId || user.is_admin === true);

  const [cards, setCards] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetchCards(courseId)
      .then((cs) => {
        if (!cancelled) setCards(cs);
      })
      .catch(() => {
        if (!cancelled) setError(t("errors.generic"));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, fetchCards]);

  function resetStatus() {
    setStatus(null);
    setError(null);
  }

  async function onAdd(e) {
    e.preventDefault();
    resetStatus();
    const payload = {
      course_id: courseId,
      question: newForm.question,
      answer: newForm.answer,
      hint: newForm.hint || null,
    };
    try {
      const created = await createCard(payload);
      setCards((prev) => [...(prev ?? []), created]);
      setNewForm(EMPTY_NEW);
      setShowNew(false);
      setStatus(t("cards.status.created"));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function startEdit(card) {
    setEditId(card.id);
    setEditForm({ question: card.question, answer: card.answer, hint: card.hint ?? "" });
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(null);
  }

  async function onSaveEdit(card) {
    resetStatus();
    const patch = {
      question: editForm.question,
      answer: editForm.answer,
      hint: editForm.hint || null,
    };
    try {
      const updated = await updateCard(card.id, courseId, patch);
      setCards((prev) => (prev ?? []).map((c) => (c.id === card.id ? updated : c)));
      setEditId(null);
      setEditForm(null);
      setStatus(t("cards.status.updated"));
    } catch (err) {
      if (err?.message === "forbidden") {
        setError(t("cards.error.forbidden"));
      } else {
        setError(t("errors.generic"));
      }
    }
  }

  async function onDelete(card) {
    if (!confirmFn(t("cards.confirm.delete"))) return;
    resetStatus();
    try {
      await deleteCard(card.id, courseId);
      setCards((prev) => (prev ?? []).filter((c) => c.id !== card.id));
      setStatus(t("cards.status.deleted"));
    } catch {
      setError(t("errors.generic"));
    }
  }

  if (cards === null && !error) return <p>{t("cards.loading")}</p>;

  const title = t("cards.title", { courseName });

  return (
    <main>
      <h1>{title}</h1>

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}

      {cards !== null && cards.length === 0 && <p>{t("cards.empty")}</p>}

      {cards !== null && cards.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t("cards.field.question")}</th>
              <th>{t("cards.field.answer")}</th>
              <th>{t("cards.field.hint")}</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const isEditing = editId === card.id;
              return (
                <tr key={card.id}>
                  {isEditing && editForm ? (
                    <>
                      <td>
                        <input
                          aria-label={t("cards.field.question")}
                          value={editForm.question}
                          onChange={(e) =>
                            setEditForm({ ...editForm, question: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={t("cards.field.answer")}
                          value={editForm.answer}
                          onChange={(e) =>
                            setEditForm({ ...editForm, answer: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={t("cards.field.hint")}
                          value={editForm.hint}
                          onChange={(e) =>
                            setEditForm({ ...editForm, hint: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <button type="button" onClick={() => onSaveEdit(card)}>
                          {t("cards.action.save")}
                        </button>
                        <button type="button" onClick={cancelEdit}>
                          {t("cards.action.cancel")}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {card.question}
                        {canSpeak && (
                          <button
                            type="button"
                            className="speak-btn"
                            aria-label={t("cards.speak")}
                            onClick={() => tts.speak(card.question, courseLang)}
                          >🔊</button>
                        )}
                      </td>
                      <td>
                        {card.answer}
                        {canSpeak && (
                          <button
                            type="button"
                            className="speak-btn"
                            aria-label={t("cards.speak")}
                            onClick={() => tts.speak(card.answer, courseLang)}
                          >🔊</button>
                        )}
                      </td>
                      <td>{card.hint ?? ""}</td>
                      {canEdit && (
                        <td>
                          <button type="button" onClick={() => startEdit(card)}>
                            {t("cards.action.edit")}
                          </button>
                          <button type="button" onClick={() => onDelete(card)}>
                            {t("cards.action.delete")}
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
        >
          {t("cards.newButton")}
        </button>
      )}

      {canEdit && showNew && (
        <form onSubmit={onAdd}>
          <label>
            {t("cards.field.question")}
            <input
              required
              aria-label={t("cards.field.question")}
              value={newForm.question}
              onChange={(e) => setNewForm({ ...newForm, question: e.target.value })}
            />
          </label>
          <label>
            {t("cards.field.answer")}
            <input
              required
              aria-label={t("cards.field.answer")}
              placeholder={t("cards.field.answerHint")}
              value={newForm.answer}
              onChange={(e) => setNewForm({ ...newForm, answer: e.target.value })}
            />
          </label>
          <label>
            {t("cards.field.hint")}
            <input
              aria-label={t("cards.field.hint")}
              value={newForm.hint}
              onChange={(e) => setNewForm({ ...newForm, hint: e.target.value })}
            />
          </label>
          <button type="submit">{t("cards.action.add")}</button>
          <button type="button" onClick={() => setShowNew(false)}>
            {t("cards.action.cancel")}
          </button>
        </form>
      )}

      <Link to="/courses">{t("common.back")}</Link>
    </main>
  );
}
