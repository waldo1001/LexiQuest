import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchMe as fetchMeApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

/**
 * Route guard: renders children only if `/api/me` resolves to an admin.
 * Non-admins redirect to `/home`; unauthenticated redirect to `/`.
 *
 * Child components receive the admin user via the `currentUser` prop
 * (so they don't need a second `/api/me` roundtrip).
 *
 * @param {{
 *   children: React.ReactNode,
 *   fetchMe?: typeof fetchMeApi,
 * }} props
 */
export default function AdminRoute({ children, fetchMe = fetchMeApi }) {
  const t = useT();
  const [state, setState] = useState({ status: "loading", user: null });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (cancelled) return;
        if (user && user.isAdmin === true) {
          setState({ status: "allowed", user });
        } else {
          setState({ status: "forbidden", user: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unauthorized", user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  if (state.status === "loading") {
    return <p>{t("admin.loading")}</p>;
  }
  if (state.status === "unauthorized") {
    return <Navigate to="/" replace />;
  }
  if (state.status === "forbidden") {
    return <Navigate to="/home" replace />;
  }
  return (
    <>
      {typeof children === "function"
        ? children(state.user)
        : children}
    </>
  );
}
