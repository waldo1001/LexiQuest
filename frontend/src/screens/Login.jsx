import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { login as loginApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

export default function Login({ login = loginApi } = {}) {
  const t = useT();
  const { userId } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ userId, password });
      navigate("/home");
    } catch {
      setError(t("login.invalid"));
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t("login.title")}</h1>
      <form onSubmit={onSubmit}>
        <label>
          {t("login.password")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
