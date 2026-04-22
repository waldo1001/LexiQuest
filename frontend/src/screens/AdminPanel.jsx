import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createUser as createUserApi,
  deleteUser as deleteUserApi,
  fetchUsers as fetchUsersApi,
  updateUser as updateUserApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";

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

      <Link to="/home">{t("common.back")}</Link>
    </main>
  );
}
