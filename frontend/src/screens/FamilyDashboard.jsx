import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFamilyStats as fetchFamilyApi, fetchCompareStats as fetchCompareApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import LineOverTime from "../charts/LineOverTime.jsx";

const RANGES = ["7d", "30d", "90d", "1y", "all"];

export default function FamilyDashboard({
  fetchFamily = fetchFamilyApi,
  fetchCompare = fetchCompareApi,
}) {
  const t = useT();
  const [range, setRange] = useState("30d");
  const [users, setUsers] = useState(null);
  const [xpSeries, setXpSeries] = useState([]);
  const [accuracySeries, setAccuracySeries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setUsers(null);
    fetchFamily({ range }, {}).then((data) => {
      if (cancelled) return;
      setUsers(data.users);
      const ids = data.users.map((u) => u.userId);
      const colors = Object.fromEntries(data.users.map((u) => [u.userId, u.color]));
      return Promise.all([
        fetchCompare({ userIds: ids, metric: "xp", range }, {}).then((d) => {
          if (!cancelled) setXpSeries(d.series ?? []);
        }),
        fetchCompare({ userIds: ids, metric: "accuracy", range }, {}).then((d) => {
          if (!cancelled) setAccuracySeries(d.series ?? []);
        }),
      ]).then(() => colors);
    }).catch(() => {
      if (!cancelled) setUsers([]);
    });
    return () => { cancelled = true; };
  }, [range, fetchFamily, fetchCompare]);

  if (users === null) return <div className="family-dashboard">{t("common.loading")}</div>;

  const colorMap = Object.fromEntries((users ?? []).map((u) => [u.userId, u.color]));
  const userIds = (users ?? []).map((u) => u.userId);

  return (
    <div className="family-dashboard">
      <header className="family-header">
        <h1>{t("family.title")}</h1>
        <nav className="range-selector" aria-label="date range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`range-${r}`}
              className={r === range ? "range-btn active" : "range-btn"}
              onClick={() => setRange(r)}
            >
              {t(`family.range.${r}`)}
            </button>
          ))}
        </nav>
      </header>

      <section className="family-users">
        {users.map((u) => (
          <Link
            key={u.userId}
            to={`/stats/user/${u.userId}`}
            data-testid="family-user-card"
            className="family-user-card"
            style={{ borderColor: u.color }}
          >
            <span className="user-avatar" data-testid={`family-user-card-${u.userId}`}>{u.avatar}</span>
            <span className="user-name">{u.name}</span>
            <span className="user-streak" data-testid={`streak-${u.userId}`}>{u.streak}</span>
            <span className="user-streak-label">{t("family.user.streak")}</span>
            <span className="user-xp" data-testid={`xp-${u.userId}`}>{u.xp}</span>
            <span className="user-xp-label">{t("family.user.xp")}</span>
            <span className="user-accuracy">{Math.round((u.accuracy ?? 0) * 100)}%</span>
            <span className="user-accuracy-label">{t("family.user.accuracy")}</span>
          </Link>
        ))}
      </section>

      <section data-testid="section-xp">
        <h2>{t("family.section.xpOverTime")}</h2>
        <LineOverTime
          data={xpSeries}
          dataKeys={userIds}
          colors={colorMap}
        />
      </section>

      <section data-testid="section-accuracy">
        <h2>{t("family.section.accuracy")}</h2>
        <LineOverTime
          data={accuracySeries}
          dataKeys={userIds}
          colors={colorMap}
        />
      </section>
    </div>
  );
}
