import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  fetchCards as fetchCardsApi,
  createCard as createCardApi,
  updateCard as updateCardApi,
  deleteCard as deleteCardApi,
  bulkDeleteCards as bulkDeleteCardsApi,
  reverseCards as reverseCardsApi,
  renameUpload as renameUploadApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useAppContext, useTts } from "../context/AppContext.jsx";

const EMPTY_NEW = { question: "", answer: "", hint: "", uploadId: "" };
const MANUAL_KEY = "__manual__";

function groupByUpload(cards) {
  const groups = new Map();
  for (const c of cards) {
    const key = c.upload_id ?? MANUAL_KEY;
    let g = groups.get(key);
    if (!g) {
      g = { key, uploadId: c.upload_id ?? null, uploadName: c.upload_name ?? null, cards: [], earliest: c.created_at };
      groups.set(key, g);
    }
    g.cards.push(c);
    if (c.upload_name && !g.uploadName) g.uploadName = c.upload_name;
    if (c.created_at && c.created_at < g.earliest) g.earliest = c.created_at;
  }
  // Manual group always first; uploads sorted by earliest created_at desc.
  const manual = groups.get(MANUAL_KEY);
  const uploads = [...groups.values()]
    .filter((g) => g.key !== MANUAL_KEY)
    .sort((a, b) => (a.earliest < b.earliest ? 1 : -1));
  return manual ? [manual, ...uploads] : uploads;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/**
 * @param {{
 *   fetchCards?: typeof fetchCardsApi,
 *   createCard?: typeof createCardApi,
 *   updateCard?: typeof updateCardApi,
 *   deleteCard?: typeof deleteCardApi,
 *   bulkDeleteCards?: typeof bulkDeleteCardsApi,
 *   reverseCards?: typeof reverseCardsApi,
 *   renameUpload?: typeof renameUploadApi,
 *   confirmFn?: (msg: string) => boolean,
 * }} props
 */
export default function CardManager({
  fetchCards = fetchCardsApi,
  createCard = createCardApi,
  updateCard = updateCardApi,
  deleteCard = deleteCardApi,
  bulkDeleteCards = bulkDeleteCardsApi,
  reverseCards = reverseCardsApi,
  renameUpload = renameUploadApi,
  confirmFn = typeof window !== "undefined"
    ? window.confirm.bind(window)
    : () => false,
}) {
  const t = useT();
  const tts = useTts();
  const { courseId } = useParams();
  const location = useLocation();
  const { courseName = "", ownerId = null, courseLang = null, questionLangDefault = null, answerLangDefault = null } = location.state ?? {};
  const ttsAvailable = Boolean(courseLang && tts.isAvailable(courseLang));

  const { user } = useAppContext();
  const canEdit =
    user !== null && (user.id === ownerId || user.isAdmin === true);

  const [cards, setCards] = useState(null);
  const [speechOn, setSpeechOn] = useState(true);
  const canSpeak = ttsAvailable && speechOn;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState(() => new Set([MANUAL_KEY]));
  const [renamingUploadId, setRenamingUploadId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

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

  const groups = useMemo(() => (cards ? groupByUpload(cards) : []), [cards]);
  const uploadOptions = useMemo(
    () =>
      groups
        .filter((g) => g.uploadId !== null)
        .map((g) => ({
          uploadId: g.uploadId,
          label: g.uploadName ?? t("cards.option.upload", { date: formatDate(g.earliest) }),
        })),
    [groups, t],
  );

  const partnerMap = useMemo(() => {
    if (!cards) return new Map();
    const map = new Map();
    for (const card of cards) {
      if (card.reverse_of) {
        const forward = cards.find((c) => c.id === card.reverse_of);
        if (forward) {
          map.set(card.id, forward);
          map.set(forward.id, card);
        }
      }
    }
    return map;
  }, [cards]);

  function resetStatus() {
    setStatus(null);
    setError(null);
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (newForm.uploadId) payload.upload_id = newForm.uploadId;
    try {
      const created = await createCard(payload);
      setCards((prev) => [...(prev ?? []), created]);
      const targetKey = created.upload_id ?? MANUAL_KEY;
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(targetKey);
        return next;
      });
      setNewForm(EMPTY_NEW);
      setShowNew(false);
      setStatus(t("cards.status.created"));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function openNewFormForUpload(uploadId) {
    setNewForm({ ...EMPTY_NEW, uploadId: uploadId ?? "" });
    setShowNew(true);
    if (uploadId) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(uploadId);
        return next;
      });
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
    const partner = partnerMap.get(card.id);
    let deletePartner = false;
    if (partner) {
      const msg = card.reverse_of
        ? t("cards.confirm.deleteAlsoForward")
        : t("cards.confirm.deleteAlsoReverse");
      deletePartner = confirmFn(msg);
    }
    resetStatus();
    try {
      await deleteCard(card.id, courseId);
      const removedIds = [card.id];
      if (deletePartner) {
        await deleteCard(partner.id, courseId);
        removedIds.push(partner.id);
      }
      setCards((prev) => (prev ?? []).filter((c) => !removedIds.includes(c.id)));
      setStatus(t("cards.status.deleted"));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDeleteUpload(group) {
    const count = group.cards.length;
    if (!confirmFn(t("cards.confirm.deleteUpload", { count }))) return;
    resetStatus();
    try {
      const result = await bulkDeleteCards({ courseId, uploadId: group.uploadId });
      const removed = new Set(group.cards.map((c) => c.id));
      setCards((prev) => (prev ?? []).filter((c) => !removed.has(c.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      setStatus(t("cards.status.bulkDeleted", { count: result.deleted }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirmFn(t("cards.confirm.deleteSelected", { count: ids.length }))) return;
    resetStatus();
    try {
      const result = await bulkDeleteCards({ courseId, ids });
      const removed = new Set(ids);
      setCards((prev) => (prev ?? []).filter((c) => !removed.has(c.id)));
      setSelected(new Set());
      setStatus(t("cards.status.bulkDeleted", { count: result.deleted }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDeleteAll() {
    const count = cards?.length ?? 0;
    if (!confirmFn(t("cards.confirm.deleteAll", { count }))) return;
    resetStatus();
    try {
      const result = await bulkDeleteCards({ courseId, all: true });
      setCards([]);
      setSelected(new Set());
      setStatus(t("cards.status.bulkDeleted", { count: result.deleted }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onReverse() {
    resetStatus();
    try {
      const result = await reverseCards({ courseId });
      if (result.created > 0) {
        const refreshed = await fetchCards(courseId);
        setCards(refreshed);
        setStatus(t("cards.status.reversed", { count: result.created }));
      } else {
        setStatus(t("cards.status.allReversed"));
      }
    } catch {
      setError(t("errors.generic"));
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startRename(group) {
    setRenamingUploadId(group.uploadId);
    setRenameValue(group.uploadName ?? "");
  }

  async function onSaveRename(uploadId) {
    if (!renameValue.trim()) return;
    resetStatus();
    try {
      await renameUpload({ courseId, uploadId, uploadName: renameValue.trim() });
      setCards((prev) =>
        (prev ?? []).map((c) =>
          c.upload_id === uploadId ? { ...c, upload_name: renameValue.trim() } : c,
        ),
      );
      setRenamingUploadId(null);
      setStatus(t("cards.status.renamed"));
    } catch {
      setError(t("errors.generic"));
    }
  }

  if (cards === null && !error) return <p>{t("cards.loading")}</p>;

  const title = t("cards.title", { courseName });

  return (
    <main>
      <div className="page-header">
        <h1>{title}</h1>
        <div className="page-header-actions">
          {groups.some((g) => g.uploadId !== null) && (
            <Link
              to={`/stats/course/${courseId}/uploads`}
              state={{ courseName }}
              className="btn btn-ghost"
              data-testid="upload-stats-link"
            >
              {t("stats.upload.link")}
            </Link>
          )}
          {ttsAvailable && (
            <button
              className={`speak-toggle ${speechOn ? "on" : "off"}`}
              aria-label={t("study.toggleSpeech")}
              data-testid="speech-toggle"
              onClick={() => setSpeechOn((v) => !v)}
            >
              {speechOn ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
            </button>
          )}
        </div>
      </div>

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}

      {cards !== null && cards.length === 0 && <p>{t("cards.empty")}</p>}

      {canEdit && cards !== null && cards.length > 0 && (
        <div className="bulk-toolbar">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={onDeleteSelected}
          >
            {t("cards.action.deleteSelected", { count: selected.size })}
          </button>
          <button type="button" onClick={onDeleteAll}>
            {t("cards.action.deleteAll")}
          </button>
          <button type="button" onClick={onReverse}>
            {t("cards.action.addReverse")}
          </button>
        </div>
      )}

      {groups.map((group) => {
        const isRenaming = renamingUploadId !== null && renamingUploadId === group.uploadId;
        const isManual = group.uploadId === null;
        const isExpanded = expandedGroups.has(group.key);
        const label =
          isManual
            ? t("cards.group.manual")
            : group.uploadName
              ? `${group.uploadName} (${group.cards.length})`
              : t("cards.group.upload", {
                  date: formatDate(group.earliest),
                  count: group.cards.length,
                });
        return (
          <section key={group.key} className={`card-group ${isExpanded ? "expanded" : "collapsed"}`}>
            {isRenaming ? (
              <div className="rename-row">
                <input
                  data-testid="rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSaveRename(group.uploadId)}
                />
                <button type="button" onClick={() => onSaveRename(group.uploadId)}>
                  {t("cards.action.save")}
                </button>
                <button type="button" onClick={() => setRenamingUploadId(null)}>
                  {t("cards.action.cancel")}
                </button>
              </div>
            ) : (
              <div className="card-group-header" role="button" tabIndex={0} onClick={() => toggleGroup(group.key)} onKeyDown={(e) => e.key === "Enter" && toggleGroup(group.key)}>
                <span className="card-group-chevron">{isExpanded ? "▾" : "▸"}</span>
                <h2>{label}</h2>
                {canEdit && !isManual && (
                  <div className="card-group-actions">
                    <button
                      type="button"
                      className="btn-icon"
                      data-testid={`upload-add-card-${group.uploadId}`}
                      onClick={(e) => { e.stopPropagation(); openNewFormForUpload(group.uploadId); }}
                      title={t("cards.action.addToUpload")}
                    >➕</button>
                    <Link
                      to={`/courses/${courseId}/import`}
                      state={{ courseId, courseName, ownerId, courseLang, questionLangDefault, answerLangDefault, uploadId: group.uploadId, uploadName: group.uploadName ?? null }}
                      className="btn-icon"
                      data-testid={`upload-import-here-${group.uploadId}`}
                      onClick={(e) => e.stopPropagation()}
                      title={t("cards.action.importHere")}
                    >📷</Link>
                    <button
                      type="button"
                      className="btn-icon"
                      data-testid="rename-btn"
                      onClick={(e) => { e.stopPropagation(); startRename(group); }}
                      title={t("cards.action.rename")}
                    >✏️</button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      onClick={(e) => { e.stopPropagation(); onDeleteUpload(group); }}
                      title={t("cards.action.deleteUpload")}
                    >🗑️</button>
                  </div>
                )}
              </div>
            )}
            {isExpanded && (
            <table>
              <thead>
                <tr>
                  {canEdit && <th></th>}
                  <th>{t("cards.field.question")}</th>
                  <th>{t("cards.field.answer")}</th>
                  <th>{t("cards.field.hint")}</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {group.cards.map((card) => {
                  const isEditing = editId === card.id;
                  return (
                    <tr key={card.id}>
                      {canEdit && (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={t("cards.select")}
                            checked={selected.has(card.id)}
                            onChange={() => toggleSelected(card.id)}
                          />
                        </td>
                      )}
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
                            {partnerMap.has(card.id) && (
                              <span className="badge-pair" title={t("cards.badge.paired", { question: partnerMap.get(card.id).question })}>↔</span>
                            )}
                            {canSpeak && (
                              <button
                                type="button"
                                className="speak-btn"
                                aria-label={t("cards.speak")}
                                onClick={() => tts.speak(card.question, card.question_lang ?? questionLangDefault ?? courseLang)}
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
                                onClick={() => tts.speak(card.answer, card.answer_lang ?? answerLangDefault ?? courseLang)}
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
          </section>
        );
      })}

      {canEdit && (
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
        >
          {t("cards.newButton")}
        </button>
      )}

      {canEdit && (
        <Link
          to={`/courses/${courseId}/import`}
          state={{ courseId, courseName, ownerId, courseLang, questionLangDefault, answerLangDefault }}
        >
          {t("import.title")}
        </Link>
      )}

      {canEdit && showNew && (
        <form onSubmit={onAdd}>
          {uploadOptions.length > 0 && (
            <label>
              {t("cards.field.addTo")}
              <select
                aria-label={t("cards.field.addTo")}
                value={newForm.uploadId}
                onChange={(e) => setNewForm({ ...newForm, uploadId: e.target.value })}
              >
                <option value="">{t("cards.group.manual")}</option>
                {uploadOptions.map((opt) => (
                  <option key={opt.uploadId} value={opt.uploadId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
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
