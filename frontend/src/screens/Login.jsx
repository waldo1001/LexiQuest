import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { login as loginApi } from "../lib/api.js";

export default function Login({ login = loginApi } = {}) {
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
    } catch (err) {
      setError(err.message || "invalid credentials");
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Enter your password</h1>
      <form onSubmit={onSubmit}>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
