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
    <main>
      <h1>{t("home.greeting", { name: me.name })}</h1>
      <button type="button" onClick={onLogout}>
        {t("home.logout")}
      </button>
      <Link to="/settings">{t("settings.title")}</Link>
      {me.isAdmin === true && <Link to="/admin">{t("admin.link")}</Link>}
    </main>
  );
}
