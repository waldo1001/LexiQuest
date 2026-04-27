import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublicUsers } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import Avatar from "../components/Avatar.jsx";

export default function UserPicker({ fetchUsers = fetchPublicUsers } = {}) {
  const t = useT();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch(() => {
        if (!cancelled) setError(t("picker.error"));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUsers, t]);

  if (error) return <p role="alert">{error}</p>;
  if (users === null) return <p>{t("picker.loading")}</p>;
  return (
    <main className="stack">
      <h1>{t("picker.title")}</h1>
      <ul className="tile-grid">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              to={`/login/${u.id}`}
              style={{ color: u.color }}
              data-testid={`picker-${u.id}`}
              className="card card-tile"
            >
              <Avatar
                avatarImageUrl={u.avatar_image_url}
                avatarEmoji={u.avatar_emoji}
                name={u.name}
              />
              <span className="tile-name">{u.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
