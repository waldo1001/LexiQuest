import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { fetchUploadStats as fetchStatsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import MasteryStack from "../charts/MasteryStack.jsx";

const RANGES = ["7d", "30d", "90d", "1y", "all"];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export default function UploadStats({ fetchStats = fetchStatsApi }) {
  const t = useT();
  const { courseId } = useParams();
  const location = useLocation();
  const { courseName = "" } = location.state ?? {};
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetchStats({ courseId, range }, {}).then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [courseId, range, fetchStats]);

  if (error) return <div className="upload-stats"><p role="alert">{t("errors.generic")}</p></div>;
  if (data === null) return <div className="upload-stats"><p>{t("common.loading")}</p></div>;

  const uploads = data.uploads ?? [];

  return (
    <div className="upload-stats">
      <div className="upload-stats-header">
        <div>
          <h1>{t("stats.upload.title")}</h1>
          {courseName && <p className="upload-stats-course">{courseName}</p>}
        </div>
        <Link to={`/courses/${courseId}/cards`} state={location.state}>
          {t("common.back")}
        </Link>
      </div>

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

      {uploads.length === 0 && <p className="upload-stats-empty">{t("stats.upload.empty")}</p>}

      <div className="upload-list">
        {uploads.map((u) => {
          const isExpanded = expandedId === u.uploadId;
          return (
            <div
              key={u.uploadId}
              className={`upload-card ${isExpanded ? "expanded" : ""}`}
              data-testid="upload-card"
            >
              <button
                type="button"
                className="upload-card-header"
                onClick={() => setExpandedId(isExpanded ? null : u.uploadId)}
                aria-expanded={isExpanded}
              >
                <span className="upload-card-name">{u.uploadName ?? u.uploadId}</span>
                <span className="upload-card-chevron">{isExpanded ? "▾" : "▸"}</span>
              </button>

              <div className="upload-card-summary">
                <span className="upload-summary-item">{t("stats.upload.cardCount", { count: u.cardCount })}</span>
                <span className="upload-summary-item">{t("stats.upload.attempts", { count: u.totalAttempts })}</span>
                <span className="upload-summary-item">{t("stats.upload.accuracy", { pct: u.accuracyPct })}</span>
                <span className="upload-summary-item">
                  {u.lastStudiedAt
                    ? t("stats.upload.lastStudied", { date: formatDate(u.lastStudiedAt) })
                    : t("stats.upload.neverStudied")}
                </span>
              </div>

              {isExpanded && (
                <div className="upload-card-body">
                  <div data-testid="mastery-stack" className="upload-mastery">
                    <MasteryStack distribution={u.masteryDistribution} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
