import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchCourseStats as fetchStatsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import MasteryStack from "../charts/MasteryStack.jsx";
import DailyBars from "../charts/DailyBars.jsx";
import TopNBars from "../charts/TopNBars.jsx";

const RANGES = ["7d", "30d", "90d", "1y", "all"];

export default function CourseStats({ fetchStats = fetchStatsApi }) {
  const t = useT();
  const { courseId } = useParams();
  const [range, setRange] = useState("30d");
  const [stats, setStats] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setNotFound(false);
    fetchStats({ courseId, range }, {}).then((s) => {
      if (!cancelled) setStats(s);
    }).catch((err) => {
      if (cancelled) return;
      if (err.message === "not_found") setNotFound(true);
      else setStats(null);
    });
    return () => { cancelled = true; };
  }, [courseId, range, fetchStats]);

  if (notFound) return <div data-testid="not-found">{t("errors.generic")}</div>;
  if (stats === null) return <div className="course-stats">{t("common.loading")}</div>;

  const color = stats.color ?? "#2563eb";
  const struggleItems = (stats.cardStruggleList ?? []).map((c) => ({
    label: c.question,
    value: c.failCount,
  }));

  return (
    <div className="course-stats">
      <header className="course-stats-header" style={{ borderColor: color }}>
        <h1 data-testid="course-name">{stats.courseName}</h1>
        <Link to="/courses">{t("common.back")}</Link>
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

      <section data-testid="section-mastery">
        <h2>{t("stats.course.section.mastery")}</h2>
        <MasteryStack distribution={stats.masteryDistribution ?? { new: 0, learning: 0, young: 0, mature: 0, mastered: 0 }} />
      </section>

      <section data-testid="section-sessions">
        <h2>{t("stats.course.section.sessions")}</h2>
        <DailyBars data={stats.sessionsOverTime ?? []} color={color} />
      </section>

      <section data-testid="section-struggle">
        <h2>{t("stats.course.section.struggle")}</h2>
        <TopNBars items={struggleItems} color={color} />
      </section>
    </div>
  );
}
