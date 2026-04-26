import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { fetchCourses as fetchCoursesApi } from "../lib/api.js";
import { useAppContext } from "../context/AppContext.jsx";
import { useT } from "../i18n/useT.js";

function calcLevel(totalXp) {
  return Math.floor((totalXp || 0) / 200) + 1;
}

export default function Dashboard({ fetchCourses = fetchCoursesApi }) {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAppContext();
  const [courses, setCourses] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCourses().then((data) => {
      if (!cancelled) setCourses(data);
    }).catch(() => {
      if (!cancelled) setCourses([]);
    });
    return () => { cancelled = true; };
  }, [fetchCourses]);

  const settings = user?.settings ?? {};
  const streak      = settings.streak       ?? 0;
  const totalXp     = settings.total_xp     ?? 0;
  const freezeTokens = settings.freeze_tokens ?? 0;
  const dailyGoal   = settings.daily_goal   ?? 20;
  const level       = calcLevel(totalXp);

  if (!courses) {
    return <div className="dashboard">{t("common.loading")}</div>;
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 data-testid="greeting">
          {t("dashboard.greeting", { name: user?.name ?? "" })}
        </h1>
        <Link to="/settings">{t("settings.title")}</Link>
        {user?.isAdmin && <Link to="/admin">{t("admin.link")}</Link>}
      </header>

      <section className="dashboard-stats">
        <div className="card stat-card">
          <span className="stat-icon">🔥</span>
          <span className="stat-value" data-testid="streak">{streak}</span>
          <span className="stat-label">{t("dashboard.streak")}</span>
        </div>

        <div className="card stat-card">
          <span className="stat-label">{t("dashboard.level")}</span>
          <span className="stat-value" data-testid="level">{level}</span>
          <span className="stat-label">{t("dashboard.xp")}</span>
          <span className="stat-value" data-testid="total-xp">{totalXp}</span>
        </div>

        <div className="card stat-card">
          <span className="stat-label">{t("dashboard.dailyGoal")}</span>
          <div className="daily-goal-bar" data-testid="daily-goal">
            <span>{dailyGoal} {t("dashboard.cards")}</span>
          </div>
        </div>

        <div className="card stat-card">
          <span className="stat-icon">🧊</span>
          <span className="stat-value" data-testid="freeze-tokens">{freezeTokens}</span>
          <span className="stat-label">{t("dashboard.freezes")}</span>
        </div>
      </section>

      <section className="dashboard-courses">
        <h2>{t("courses.title")}</h2>
        {courses.length === 0 && <p>{t("courses.empty")}</p>}
        <div className="course-grid">
          {courses.map((c) => (
            <div key={c.id} className="card course-card" style={{ borderColor: c.color }}>
              <span className="course-emoji">{c.emoji}</span>
              <span className="course-name">{c.name}</span>
              <div className="row">
                <button
                  className="btn btn-primary"
                  data-testid="study-btn"
                  onClick={() =>
                    navigate(`/courses/${c.id}/setup`, {
                      state: {
                        courseName: c.name,
                        defaultMode: c.default_mode ?? "ask",
                        courseLang: c.language ?? null,
                        questionLangDefault: c.question_lang_default ?? null,
                        answerLangDefault: c.answer_lang_default ?? null,
                      },
                    })
                  }
                >
                  {t("courses.action.study")}
                </button>
                <Link
                  className="btn btn-ghost"
                  to={`/courses/${c.id}/cards`}
                  state={{ courseName: c.name, ownerId: c.user_id, courseLang: c.language ?? null, questionLangDefault: c.question_lang_default ?? null, answerLangDefault: c.answer_lang_default ?? null }}
                >
                  {t("courses.action.manageCards")}
                </Link>
              </div>
            </div>
          ))}
        </div>
        <Link to="/courses">{t("dashboard.allCourses")}</Link>
      </section>
    </div>
  );
}
