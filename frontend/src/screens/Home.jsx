import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe, logout as logoutApi } from "../lib/api.js";

export default function Home({
  fetchMe: fetchMeInjected = fetchMe,
  logout: logoutInjected = logoutApi,
} = {}) {
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

  if (failed) return <p role="alert">Not signed in — go to the picker</p>;
  if (!me) return <p>Loading…</p>;
  return (
    <main>
      <h1>Hello, {me.name}</h1>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </main>
  );
}
