import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchMe, logout as logoutApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

export default function Home({
  fetchMe: fetchMeInjected = fetchMe,
  logout: logoutInjected = logoutApi,
} = {}) {
  const t = useT();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMeInjected()
      .then((u) => {
        if (!cancelled) setMe(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMeInjected]);

  async function onLogout() {
    await logoutInjected();
    navigate("/");
  }

  if (failed) return <p role="alert">{t("home.notSignedIn")}</p>;
  if (!me) return <p>{t("home.loading")}</p>;
  return (
    <main className="stack">
      <h1>{t("home.greeting", { name: me.name })}</h1>
      <nav className="home-actions">
        <Link className="card card-tile" to="/courses">
          <span className="avatar" aria-hidden="true">📚</span>
          <span className="tile-name">{t("courses.link")}</span>
        </Link>
        <Link className="card card-tile" to="/settings">
          <span className="avatar" aria-hidden="true">⚙️</span>
          <span className="tile-name">{t("settings.title")}</span>
        </Link>
        {me.isAdmin === true && (
          <Link className="card card-tile" to="/admin">
            <span className="avatar" aria-hidden="true">🛠️</span>
            <span className="tile-name">{t("admin.link")}</span>
          </Link>
        )}
      </nav>
      <button type="button" className="btn btn-ghost" onClick={onLogout}>
        {t("home.logout")}
      </button>
    </main>
  );
}
