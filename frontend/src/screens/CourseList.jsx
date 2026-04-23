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
};

const LANGUAGES = [
  { value: "none", labelKey: "courses.language.none" },
  { value: "fr-FR", label: "fr-FR" },
  { value: "nl-BE", label: "nl-BE" },
  { value: "en-GB", label: "en-GB" },
  { value: "de-DE", label: "de-DE" },
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
      default_mode: course.default_mode,
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
      state: { courseName: course.name, mode, courseLang: course.language ?? null },
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
            <article key={course.id}>
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
                  <button type="submit">{t("courses.action.save")}</button>
                  <button type="button" onClick={cancelEdit}>
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
                        onClick={() => setModePicking((prev) => prev === course.id ? null : course.id)}
                      >
                        {t("courses.action.study")}
                      </button>
                      {modePicking === course.id && (
                        <div>
                          <p>{t("courses.modePicker.title")}</p>
                          <button type="button" onClick={() => startStudy(course, "self_grade")}>
                            {t("courses.modePicker.self_grade")}
                          </button>
                          <button type="button" onClick={() => startStudy(course, "mcq")}>
                            {t("courses.modePicker.mcq")}
                          </button>
                          <button type="button" onClick={() => startStudy(course, "mixed")}>
                            {t("courses.modePicker.mixed")}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={`/courses/${course.id}/study`}
                      state={{ courseName: course.name, mode: course.default_mode ?? "self_grade", courseLang: course.language ?? null }}
                    >
                      {t("courses.action.study")}
                    </Link>
                  )}
                  <Link
                    to={`/courses/${course.id}/cards`}
                    state={{ courseName: course.name, ownerId: course.user_id, courseLang: course.language ?? null }}
                  >
                    {t("courses.action.manageCards")}
                  </Link>
                  {enrichCards && (
                    <button
                      type="button"
                      disabled={enrichingId === course.id}
                      onClick={() => onEnrich(course)}
                    >
                      {enrichingId === course.id
                        ? t("courses.status.enriching")
                        : t("courses.action.enrich")}
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(course)}>
                    {t("courses.action.edit")}
                  </button>
                  <button type="button" onClick={() => onDelete(course)}>
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
        disabled={!currentYear}
        onClick={() => setShowNew((v) => !v)}
      >
        {t("courses.newButton")}
      </button>

      {showNew && currentYear && (
        <form onSubmit={onCreate}>
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
          <button type="submit">{t("courses.action.create")}</button>
          <button type="button" onClick={() => setShowNew(false)}>
            {t("courses.action.cancel")}
          </button>
        </form>
      )}

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
