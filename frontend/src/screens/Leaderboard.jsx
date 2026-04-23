import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLeaderboard as fetchLeaderboardApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

const PERIODS = ["7d", "30d", "all"];

export default function Leaderboard({ fetchLeaderboard = fetchLeaderboardApi }) {
  const t = useT();
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetchLeaderboard({ period }, {}).then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      if (!cancelled) setData({ rankings: [], mostAccurate: null, longestStreak: null, mostSessions: null });
    });
    return () => { cancelled = true; };
  }, [period, fetchLeaderboard]);

  if (data === null) return <div className="leaderboard">{t("common.loading")}</div>;

  const { rankings, mostAccurate, longestStreak, mostSessions } = data;

  return (
    <div className="leaderboard">
      <header className="leaderboard-header">
        <h1>{t("leaderboard.title")}</h1>
        <nav className="period-selector">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`period-${p}`}
              className={p === period ? "period-btn active" : "period-btn"}
              onClick={() => setPeriod(p)}
            >
              {t(`leaderboard.period.${p}`)}
            </button>
          ))}
        </nav>
      </header>

      <section className="awards-row">
        {mostAccurate && (
          <div data-testid="award-mostAccurate" className="award-card">
            <span className="award-label">{t("leaderboard.award.mostAccurate")}</span>
            <span>{mostAccurate.name}</span>
          </div>
        )}
        {longestStreak && (
          <div data-testid="award-longestStreak" className="award-card">
            <span className="award-label">{t("leaderboard.award.longestStreak")}</span>
            <span>{longestStreak.name}</span>
          </div>
        )}
        {mostSessions && (
          <div data-testid="award-mostSessions" className="award-card">
            <span className="award-label">{t("leaderboard.award.mostSessions")}</span>
            <span>{mostSessions.name}</span>
          </div>
        )}
      </section>

      <ol className="rankings-list">
        {rankings.map((entry, idx) => (
          <li key={entry.userId}>
            <Link to={`/stats/user/${entry.userId}`} data-testid="ranking-row" style={{ borderColor: entry.color }}>
              <span data-testid={`rank-${idx + 1}`} className="rank-number">{idx + 1}</span>
              <span className="rank-avatar">{entry.avatar}</span>
              <span className="rank-name">{entry.name}</span>
              <span className="rank-xp">{entry.xp}</span>
              <span className="rank-xp-label">{t("leaderboard.xp")}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
