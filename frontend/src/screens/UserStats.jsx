import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchUserStats as fetchStatsApi, fetchHeatmap as fetchHeatmapApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import LineOverTime from "../charts/LineOverTime.jsx";
import CalendarHeatmap from "../charts/CalendarHeatmap.jsx";
import HourHistogram from "../charts/HourHistogram.jsx";
import ResponseTimeHistogram from "../charts/ResponseTimeHistogram.jsx";

const RANGES = ["7d", "30d", "90d", "1y", "all"];
const TABS = ["overview", "courses", "badges"];

export default function UserStats({
  fetchStats = fetchStatsApi,
  fetchHeatmap = fetchHeatmapApi,
}) {
  const t = useT();
  const { userId } = useParams();
  const [range, setRange] = useState("30d");
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [tab, setTab] = useState("overview");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setNotFound(false);
    Promise.all([
      fetchStats({ userId, range }, {}),
      fetchHeatmap({ userId, range: "1y" }, {}),
    ]).then(([s, h]) => {
      if (cancelled) return;
      setStats(s);
      setHeatmap(h.heatmap ?? []);
    }).catch((err) => {
      if (cancelled) return;
      if (err.message === "not_found") setNotFound(true);
      else setStats(null);
    });
    return () => { cancelled = true; };
  }, [userId, range, fetchStats, fetchHeatmap]);

  if (notFound) return <div data-testid="not-found">{t("errors.generic")}</div>;
  if (stats === null) return <div className="user-stats">{t("common.loading")}</div>;

  const color = stats.color ?? "#2563eb";

  return (
    <div className="user-stats">
      <header className="user-stats-header" style={{ borderColor: color }}>
        <span className="user-avatar">{stats.avatar}</span>
        <h1 data-testid="user-name">{stats.name}</h1>
        <div className="user-stats-meta">
          <span data-testid="user-level">{stats.level}</span>
          <span data-testid="user-xp">{stats.totalXp}</span>
          <span data-testid="user-streak">{stats.currentStreak}</span>
        </div>
        <Link to="/family">{t("common.back")}</Link>
      </header>

      <nav className="range-selector">
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

      <nav className="stats-tabs">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            data-testid={`tab-${tb}`}
            className={tb === tab ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab(tb)}
          >
            {t(`stats.user.tab.${tb}`)}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="stats-overview">
          <section data-testid="section-heatmap">
            <h2>{t("stats.user.section.heatmap")}</h2>
            <CalendarHeatmap data={heatmap} color={color} />
          </section>
          <section data-testid="section-xp">
            <h2>{t("stats.user.section.xp")}</h2>
            <LineOverTime data={stats.xpOverTime ?? []} dataKeys={["value"]} colors={{ value: color }} />
          </section>
          <section data-testid="section-accuracy">
            <h2>{t("stats.user.section.accuracy")}</h2>
            <LineOverTime data={stats.accuracyTrend ?? []} dataKeys={["value"]} colors={{ value: color }} />
          </section>
          <section data-testid="section-hour">
            <h2>{t("stats.user.section.hour")}</h2>
            <HourHistogram data={stats.hourOfDay ?? []} color={color} />
          </section>
          <section data-testid="section-response">
            <h2>{t("stats.user.section.response")}</h2>
            <ResponseTimeHistogram data={stats.responseTimeBuckets ?? []} color={color} />
          </section>
        </div>
      )}

      {tab === "courses" && (
        <div data-testid="courses-section">
          <p>{t("courses.title")}</p>
        </div>
      )}

      {tab === "badges" && (
        <div data-testid="badges-section">
          <ul>
            {(stats.badgesEarned ?? []).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
