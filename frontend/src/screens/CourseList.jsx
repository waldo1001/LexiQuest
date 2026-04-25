import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import {
  fetchYears as fetchYearsApi,
  fetchCourses as fetchCoursesApi,
  createCourse as createCourseApi,
  updateCourse as updateCourseApi,
  deleteCourse as deleteCourseApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";

const EMPTY_NEW = {
  name: "",
  emoji: "📚",
  color: "#2563eb",
  language: "none",
  default_mode: "ask",
  bidirectional: false,
};

const LANGUAGES = [
  { value: "none", labelKey: "courses.language.none" },
  { value: "fr-FR", label: "fr-FR" },
  { value: "nl-BE", label: "nl-BE" },
  { value: "en-GB", label: "en-GB" },
  { value: "de-DE", label: "de-DE" },
];

const SIDE_LANGS = [
  { value: "", labelKey: "import.langNone" },
  { value: "en", label: "English" },
  { value: "nl", label: "Nederlands" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

const MODES = [
  { value: "self_grade", labelKey: "courses.mode.self_grade" },
  { value: "mcq", labelKey: "courses.mode.mcq" },
  { value: "mixed", labelKey: "courses.mode.mixed" },
  { value: "ask", labelKey: "courses.mode.ask" },
];

/**
 * @param {{
 *   fetchYears?: typeof fetchYearsApi,
 *   fetchCourses?: typeof fetchCoursesApi,
 *   createCourse?: typeof createCourseApi,
 *   updateCourse?: typeof updateCourseApi,
 *   deleteCourse?: typeof deleteCourseApi,
 *   confirmFn?: (msg: string) => boolean,
 * }} props
 */
export default function CourseList({
  fetchYears = fetchYearsApi,
  fetchCourses = fetchCoursesApi,
  createCourse = createCourseApi,
  updateCourse = updateCourseApi,
  deleteCourse = deleteCourseApi,
  confirmFn = typeof window !== "undefined"
    ? window.confirm.bind(window)
    : () => false,
  enrichCards = null,
}) {
  const t = useT();
  const { user } = useAppContext();
  const navigate = useNavigate();
  const [years, setYears] = useState(null);
  const [courses, setCourses] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [modePicking, setModePicking] = useState(null);
  const [enrichingId, setEnrichingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchYears(), fetchCourses()])
      .then(([ys, cs]) => {
        if (!cancelled) {
          setYears(ys);
          setCourses(cs);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("errors.generic"));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchYears, fetchCourses]);

  const currentYear = years?.find((y) => y.is_current) ?? null;
  const visibleCourses = currentYear
    ? (courses ?? []).filter((c) => c.year_id === currentYear.id)
    : [];

  function resetStatus() {
    setStatus(null);
    setError(null);
  }

  async function onCreate(e) {
    e.preventDefault();
    resetStatus();
    const payload = {
      name: newForm.name,
      emoji: newForm.emoji,
      color: newForm.color,
      language: newForm.language === "none" ? null : newForm.language,
      default_mode: newForm.default_mode,
      bidirectional: newForm.bidirectional,
      year_id: currentYear.id,
    };
    try {
      const created = await createCourse(payload);
      setCourses((prev) => [...(prev ?? []), created]);
      setNewForm(EMPTY_NEW);
      setShowNew(false);
      setStatus(t("courses.status.created", { name: created.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function startEdit(course) {
    setEditId(course.id);
    setEditForm({
      name: course.name,
      emoji: course.emoji,
      color: course.color,
      language: course.language ?? "none",
      question_lang_default: course.question_lang_default ?? "",
      answer_lang_default: course.answer_lang_default ?? "",
      default_mode: course.default_mode,
      bidirectional: course.bidirectional ?? false,
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(null);
  }

  async function onSaveEdit(course) {
    resetStatus();
    const payload = {
      ...editForm,
      language: editForm.language === "none" ? null : editForm.language,
      question_lang_default: editForm.question_lang_default || null,
      answer_lang_default: editForm.answer_lang_default || null,
    };
    try {
      const updated = await updateCourse(course.id, payload);
      setCourses((prev) =>
        (prev ?? []).map((c) => (c.id === course.id ? updated : c)),
      );
      setEditId(null);
      setEditForm(null);
      setStatus(t("courses.status.updated", { name: updated.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDelete(course) {
    if (!confirmFn(t("courses.confirm.delete", { name: course.name }))) return;
    resetStatus();
    try {
      await deleteCourse(course.id);
      setCourses((prev) => (prev ?? []).filter((c) => c.id !== course.id));
      setStatus(t("courses.status.deleted", { name: course.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function startStudy(course, mode) {
    navigate(`/courses/${course.id}/study`, {
      state: { courseName: course.name, mode, courseLang: course.language ?? null, questionLangDefault: course.question_lang_default ?? null, answerLangDefault: course.answer_lang_default ?? null },
    });
  }

  async function onEnrich(course) {
    resetStatus();
    setEnrichingId(course.id);
    try {
      const result = await enrichCards({ courseId: course.id });
      setStatus(t("courses.status.enriched", { count: result.enriched }));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setEnrichingId(null);
    }
  }

  if (years === null || courses === null) return <p>{t("courses.loading")}</p>;

  return (
    <main>
      <h1>{t("courses.title")}</h1>

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}

      {!currentYear && <p>{t("courses.noYear")}</p>}

      {visibleCourses.length === 0 && currentYear && (
        <p>{t("courses.empty")}</p>
      )}

      <div>
        {visibleCourses.map((course) => {
          const isEditing = editId === course.id;
          return (
            <article key={course.id} className="card">
              {isEditing && editForm ? (
                <form onSubmit={(e) => { e.preventDefault(); onSaveEdit(course); }}>
                  <label>
                    {t("courses.field.name")}
                    <input
                      aria-label={t("courses.field.name")}
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("courses.field.emoji")}
                    <input
                      aria-label={t("courses.field.emoji")}
                      value={editForm.emoji}
                      onChange={(e) =>
                        setEditForm({ ...editForm, emoji: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("courses.field.color")}
                    <input
                      aria-label={t("courses.field.color")}
                      value={editForm.color}
                      onChange={(e) =>
                        setEditForm({ ...editForm, color: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("courses.field.language")}
                    <select
                      aria-label={t("courses.field.language")}
                      value={editForm.language}
                      onChange={(e) =>
                        setEditForm({ ...editForm, language: e.target.value })
                      }
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.labelKey ? t(l.labelKey) : l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editForm.language !== "none" && (
                    <>
                      <label>
                        {t("import.questionLang")}
                        <select
                          aria-label={t("import.questionLang")}
                          value={editForm.question_lang_default}
                          onChange={(e) => setEditForm({ ...editForm, question_lang_default: e.target.value })}
                        >
                          {SIDE_LANGS.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.labelKey ? t(l.labelKey) : l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("import.answerLang")}
                        <select
                          aria-label={t("import.answerLang")}
                          value={editForm.answer_lang_default}
                          onChange={(e) => setEditForm({ ...editForm, answer_lang_default: e.target.value })}
                        >
                          {SIDE_LANGS.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.labelKey ? t(l.labelKey) : l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    {t("courses.field.defaultMode")}
                    <select
                      aria-label={t("courses.field.defaultMode")}
                      value={editForm.default_mode}
                      onChange={(e) =>
                        setEditForm({ ...editForm, default_mode: e.target.value })
                      }
                    >
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {t(m.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.bidirectional}
                      onChange={(e) => setEditForm({ ...editForm, bidirectional: e.target.checked })}
                    />
                    {t("courses.field.bidirectional")}
                  </label>
                  <button type="submit" className="btn btn-primary">
                    {t("courses.action.save")}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                    {t("courses.action.cancel")}
                  </button>
                </form>
              ) : (
                <>
                  <span>{course.emoji}</span>
                  <span>{course.name}</span>
                  {course.default_mode === "ask" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setModePicking((prev) => prev === course.id ? null : course.id)}
                      >
                        {t("courses.action.study")}
                      </button>
                      {modePicking === course.id && (
                        <div className="row wrap">
                          <p>{t("courses.modePicker.title")}</p>
                          <button type="button" className="btn btn-ghost" onClick={() => startStudy(course, "self_grade")}>
                            {t("courses.modePicker.self_grade")}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => startStudy(course, "mcq")}>
                            {t("courses.modePicker.mcq")}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => startStudy(course, "mixed")}>
                            {t("courses.modePicker.mixed")}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      className="btn btn-primary"
                      to={`/courses/${course.id}/study`}
                      state={{ courseName: course.name, mode: course.default_mode ?? "self_grade", courseLang: course.language ?? null, questionLangDefault: course.question_lang_default ?? null, answerLangDefault: course.answer_lang_default ?? null }}
                    >
                      {t("courses.action.study")}
                    </Link>
                  )}
                  <Link
                    className="btn btn-ghost"
                    to={`/courses/${course.id}/cards`}
                    state={{ courseName: course.name, ownerId: course.user_id, courseLang: course.language ?? null, questionLangDefault: course.question_lang_default ?? null, answerLangDefault: course.answer_lang_default ?? null }}
                  >
                    {t("courses.action.manageCards")}
                  </Link>
                  {enrichCards && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={enrichingId === course.id}
                      onClick={() => onEnrich(course)}
                    >
                      {enrichingId === course.id
                        ? t("courses.status.enriching")
                        : t("courses.action.enrich")}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(course)}>
                    {t("courses.action.edit")}
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => onDelete(course)}>
                    {t("courses.action.delete")}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={!currentYear}
        onClick={() => setShowNew((v) => !v)}
      >
        {t("courses.newButton")}
      </button>

      {showNew && currentYear && (
        <form className="panel stack" onSubmit={onCreate}>
          <label>
            {t("courses.field.name")}
            <input
              required
              aria-label={t("courses.field.name")}
              value={newForm.name}
              onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
            />
          </label>
          <label>
            {t("courses.field.emoji")}
            <input
              aria-label={t("courses.field.emoji")}
              value={newForm.emoji}
              onChange={(e) =>
                setNewForm({ ...newForm, emoji: e.target.value })
              }
            />
          </label>
          <label>
            {t("courses.field.color")}
            <input
              aria-label={t("courses.field.color")}
              value={newForm.color}
              onChange={(e) =>
                setNewForm({ ...newForm, color: e.target.value })
              }
            />
          </label>
          <label>
            {t("courses.field.language")}
            <select
              aria-label={t("courses.field.language")}
              value={newForm.language}
              onChange={(e) =>
                setNewForm({ ...newForm, language: e.target.value })
              }
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.labelKey ? t(l.labelKey) : l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("courses.field.defaultMode")}
            <select
              aria-label={t("courses.field.defaultMode")}
              value={newForm.default_mode}
              onChange={(e) =>
                setNewForm({ ...newForm, default_mode: e.target.value })
              }
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={newForm.bidirectional}
              onChange={(e) => setNewForm({ ...newForm, bidirectional: e.target.checked })}
            />
            {t("courses.field.bidirectional")}
          </label>
          <button type="submit" className="btn btn-primary">
            {t("courses.action.create")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
            {t("courses.action.cancel")}
          </button>
        </form>
      )}

      <Link className="btn btn-ghost" to="/home">{t("common.back")}</Link>
    </main>
  );
}
