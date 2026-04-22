import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createUser as createUserApi,
  deleteUser as deleteUserApi,
  fetchUsers as fetchUsersApi,
  updateUser as updateUserApi,
  fetchYears as fetchYearsApi,
  createYear as createYearApi,
  updateYear as updateYearApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";

const EMPTY_NEW_YEAR = {
  label: "",
  start_date: "",
  end_date: "",
  is_current: false,
};

const EMPTY_NEW = {
  name: "",
  password: "",
  color: "#2563eb",
  avatar_emoji: "🙂",
  is_admin: false,
  ui_language: "nl",
};

/**
 * @param {{
 *   currentUserId?: string,
 *   fetchUsers?: typeof fetchUsersApi,
 *   createUser?: typeof createUserApi,
 *   updateUser?: typeof updateUserApi,
 *   deleteUser?: typeof deleteUserApi,
 *   fetchYears?: typeof fetchYearsApi,
 *   createYear?: typeof createYearApi,
 *   updateYear?: typeof updateYearApi,
 *   promptFn?: (msg: string) => string | null,
 *   confirmFn?: (msg: string) => boolean,
 * }} props
 */
export default function AdminPanel({
  currentUserId,
  fetchUsers = fetchUsersApi,
  createUser = createUserApi,
  updateUser = updateUserApi,
  deleteUser = deleteUserApi,
  fetchYears = fetchYearsApi,
  createYear = createYearApi,
  updateYear = updateYearApi,
  promptFn = typeof window !== "undefined"
    ? window.prompt.bind(window)
    : () => null,
  confirmFn = typeof window !== "undefined"
    ? window.confirm.bind(window)
    : () => false,
}) {
  const t = useT();
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [years, setYears] = useState(null);
  const [newYearForm, setNewYearForm] = useState(EMPTY_NEW_YEAR);
  const [editYearId, setEditYearId] = useState(null);
  const [editYearForm, setEditYearForm] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((list) => {
        if (!cancelled) setUsers(sortByName(list));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUsers]);

  useEffect(() => {
    let cancelled = false;
    fetchYears()
      .then((list) => {
        if (!cancelled)
          setYears([...list].sort((a, b) => b.start_date.localeCompare(a.start_date)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchYears]);

  function sortByName(list) {
    return [...list].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  function resetStatus() {
    setStatus(null);
    setError(null);
  }

  async function onCreate(e) {
    e.preventDefault();
    resetStatus();
    try {
      const created = await createUser({ ...newForm });
      setUsers((prev) => sortByName([...(prev ?? []), created]));
      setNewForm(EMPTY_NEW);
      setStatus(t("admin.status.created", { name: created.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setEditForm({
      name: user.name,
      color: user.color,
      avatar_emoji: user.avatar_emoji,
      is_admin: user.isAdmin,
      ui_language: user.ui_language,
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(null);
  }

  async function onSaveEdit(user) {
    resetStatus();
    try {
      const updated = await updateUser(user.id, editForm);
      setUsers((prev) =>
        sortByName((prev ?? []).map((u) => (u.id === user.id ? updated : u))),
      );
      setEditId(null);
      setEditForm(null);
      setStatus(t("admin.status.updated", { name: updated.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onResetPassword(user) {
    const pw = promptFn(t("admin.prompt.newPassword", { name: user.name }));
    if (!pw) return;
    resetStatus();
    try {
      await updateUser(user.id, { password: pw });
      setStatus(t("admin.status.passwordReset", { name: user.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onDelete(user) {
    if (!confirmFn(t("admin.confirm.delete", { name: user.name }))) return;
    resetStatus();
    try {
      await deleteUser(user.id);
      setUsers((prev) => (prev ?? []).filter((u) => u.id !== user.id));
      setStatus(t("admin.status.deleted", { name: user.name }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onCreateYear(e) {
    e.preventDefault();
    resetStatus();
    try {
      const created = await createYear({ ...newYearForm });
      setYears((prev) =>
        [...(prev ?? []), created].sort((a, b) =>
          b.start_date.localeCompare(a.start_date),
        ),
      );
      setNewYearForm(EMPTY_NEW_YEAR);
      setStatus(t("admin.years.status.created", { label: created.label }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  function startEditYear(year) {
    setEditYearId(year.id);
    setEditYearForm({
      label: year.label,
      start_date: year.start_date,
      end_date: year.end_date,
    });
  }

  function cancelEditYear() {
    setEditYearId(null);
    setEditYearForm(null);
  }

  async function onSaveEditYear(year) {
    resetStatus();
    try {
      const updated = await updateYear(year.id, editYearForm);
      setYears((prev) =>
        [...(prev ?? []).map((y) => (y.id === year.id ? updated : y))].sort(
          (a, b) => b.start_date.localeCompare(a.start_date),
        ),
      );
      setEditYearId(null);
      setEditYearForm(null);
      setStatus(t("admin.years.status.updated", { label: updated.label }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  async function onSetCurrentYear(year) {
    resetStatus();
    try {
      const updated = await updateYear(year.id, { is_current: true });
      setYears((prev) =>
        (prev ?? []).map((y) =>
          y.id === year.id ? updated : { ...y, is_current: false },
        ),
      );
      setStatus(t("admin.years.status.setCurrent", { label: year.label }));
    } catch {
      setError(t("errors.generic"));
    }
  }

  if (loadError) return <p role="alert">{t("errors.generic")}</p>;
  if (users === null) return <p>{t("admin.loading")}</p>;

  return (
    <main>
      <h1>{t("admin.title")}</h1>

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>{t("admin.field.name")}</th>
            <th>{t("admin.field.avatar")}</th>
            <th>{t("admin.field.color")}</th>
            <th>{t("admin.field.isAdmin")}</th>
            <th>{t("admin.field.uiLanguage")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isEditing = editId === u.id;
            const isSelf = currentUserId === u.id;
            return (
              <tr key={u.id}>
                {isEditing && editForm ? (
                  <>
                    <td>
                      <input
                        aria-label={t("admin.field.name")}
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("admin.field.avatar")}
                        value={editForm.avatar_emoji}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            avatar_emoji: e.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("admin.field.color")}
                        value={editForm.color}
                        onChange={(e) =>
                          setEditForm({ ...editForm, color: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t("admin.field.isAdmin")}
                        checked={editForm.is_admin}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            is_admin: e.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={t("admin.field.uiLanguage")}
                        value={editForm.ui_language}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            ui_language: e.target.value,
                          })
                        }
                      >
                        <option value="en">en</option>
                        <option value="nl">nl</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" onClick={() => onSaveEdit(u)}>
                        {t("admin.action.save")}
                      </button>
                      <button type="button" onClick={cancelEdit}>
                        {t("admin.action.cancel")}
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{u.name}</td>
                    <td>{u.avatar_emoji}</td>
                    <td>{u.color}</td>
                    <td>{u.isAdmin ? t("common.yes") : t("common.no")}</td>
                    <td>{u.ui_language}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(u)}>
                        {t("admin.action.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onResetPassword(u)}
                      >
                        {t("admin.action.resetPassword")}
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => onDelete(u)}
                        >
                          {t("admin.action.delete")}
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>{t("admin.newUser")}</h2>
      <form onSubmit={onCreate}>
        <label>
          {t("admin.field.name")}
          <input
            required
            value={newForm.name}
            onChange={(e) =>
              setNewForm({ ...newForm, name: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.field.password")}
          <input
            required
            type="password"
            value={newForm.password}
            onChange={(e) =>
              setNewForm({ ...newForm, password: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.field.color")}
          <input
            value={newForm.color}
            onChange={(e) =>
              setNewForm({ ...newForm, color: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.field.avatar")}
          <input
            value={newForm.avatar_emoji}
            onChange={(e) =>
              setNewForm({ ...newForm, avatar_emoji: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.field.isAdmin")}
          <input
            type="checkbox"
            checked={newForm.is_admin}
            onChange={(e) =>
              setNewForm({ ...newForm, is_admin: e.target.checked })
            }
          />
        </label>
        <label>
          {t("admin.field.uiLanguage")}
          <select
            value={newForm.ui_language}
            onChange={(e) =>
              setNewForm({ ...newForm, ui_language: e.target.value })
            }
          >
            <option value="en">en</option>
            <option value="nl">nl</option>
          </select>
        </label>
        <button type="submit">{t("admin.action.create")}</button>
      </form>

      <h2>{t("admin.years.section")}</h2>
      {years === null ? (
        <p>{t("admin.years.loading")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("admin.years.field.label")}</th>
              <th>{t("admin.years.field.start")}</th>
              <th>{t("admin.years.field.end")}</th>
              <th>{t("admin.years.field.current")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const isEditing = editYearId === y.id;
              return (
                <tr key={y.id}>
                  {isEditing && editYearForm ? (
                    <>
                      <td>
                        <input
                          aria-label={t("admin.years.field.label")}
                          value={editYearForm.label}
                          onChange={(e) =>
                            setEditYearForm({
                              ...editYearForm,
                              label: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={t("admin.years.field.start")}
                          value={editYearForm.start_date}
                          onChange={(e) =>
                            setEditYearForm({
                              ...editYearForm,
                              start_date: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={t("admin.years.field.end")}
                          value={editYearForm.end_date}
                          onChange={(e) =>
                            setEditYearForm({
                              ...editYearForm,
                              end_date: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>{y.is_current ? t("common.yes") : t("common.no")}</td>
                      <td>
                        <button type="button" onClick={() => onSaveEditYear(y)}>
                          {t("admin.years.action.save")}
                        </button>
                        <button type="button" onClick={cancelEditYear}>
                          {t("admin.action.cancel")}
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{y.label}</td>
                      <td>{y.start_date}</td>
                      <td>{y.end_date}</td>
                      <td>{y.is_current ? t("common.yes") : t("common.no")}</td>
                      <td>
                        <button type="button" onClick={() => startEditYear(y)}>
                          {t("admin.years.action.edit")}
                        </button>
                        {!y.is_current && (
                          <button
                            type="button"
                            onClick={() => onSetCurrentYear(y)}
                          >
                            {t("admin.years.action.setCurrent")}
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>{t("admin.years.new")}</h3>
      <form onSubmit={onCreateYear}>
        <label>
          {t("admin.years.field.label")}
          <input
            required
            value={newYearForm.label}
            onChange={(e) =>
              setNewYearForm({ ...newYearForm, label: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.years.field.start")}
          <input
            required
            value={newYearForm.start_date}
            onChange={(e) =>
              setNewYearForm({ ...newYearForm, start_date: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.years.field.end")}
          <input
            required
            value={newYearForm.end_date}
            onChange={(e) =>
              setNewYearForm({ ...newYearForm, end_date: e.target.value })
            }
          />
        </label>
        <label>
          {t("admin.years.field.current")}
          <input
            type="checkbox"
            checked={newYearForm.is_current}
            onChange={(e) =>
              setNewYearForm({ ...newYearForm, is_current: e.target.checked })
            }
          />
        </label>
        <button type="submit">{t("admin.years.action.create")}</button>
      </form>

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
