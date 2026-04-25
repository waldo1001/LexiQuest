import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useT } from "../i18n/useT.js";

function formatDuration(seconds) {
  const s = seconds || 0;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function calcAccuracy(studied, correct) {
  if (!studied) return 0;
  return Math.round((correct / studied) * 100);
}

export default function SessionResults() {
  const t = useT();
  const navigate = useNavigate();
  const { courseId } = useParams();
  const location = useLocation();
  const state = location.state ?? {};

  const cardsStudied  = state.cards_studied  ?? 0;
  const cardsCorrect  = state.cards_correct  ?? 0;
  const durationSec   = state.duration_seconds ?? 0;
  const xpEarned      = state.xp_earned      ?? 0;
  const courseName    = state.courseName     ?? "";
  const mode          = state.mode           ?? "self_grade";
  const gameType      = state.gameType       ?? "classic";

  const MULTIPLIERS = { classic: 1.0, boss_round: 1.5, speed_round: 1.25, review_blitz: 1.0 };
  const multiplier = MULTIPLIERS[gameType] ?? 1.0;
  const showGameBadge = gameType !== "classic";
  const cardsPerMinute = durationSec > 0 ? Math.round(cardsStudied / (durationSec / 60)) : cardsStudied;

  const accuracy = calcAccuracy(cardsStudied, cardsCorrect);

  return (
    <div className="session-results">
      <h1>{t("results.title")}</h1>

      {showGameBadge && (
        <div className="game-badge" data-testid="game-type-badge">
          {t(`setup.gameType.${gameType}`)}
          {multiplier > 1 && (
            <span className="xp-multiplier" data-testid="xp-multiplier">
              {t("results.multiplier", { multiplier })}
            </span>
          )}
        </div>
      )}

      <div className="results-stats">
        <div className="results-stat">
          <span className="results-label">{t("results.cardsStudied")}</span>
          <span className="results-value" data-testid="cards-studied">{cardsStudied}</span>
        </div>

        <div className="results-stat">
          <span className="results-label">{t("results.correct")}</span>
          <span className="results-value" data-testid="cards-correct">{cardsCorrect}</span>
        </div>

        <div className="results-stat">
          <span className="results-label">{t("results.accuracy")}</span>
          <span className="results-value" data-testid="accuracy">{accuracy}%</span>
        </div>

        <div className="results-stat">
          <span className="results-label">{t("results.time")}</span>
          <span className="results-value" data-testid="duration">{formatDuration(durationSec)}</span>
        </div>

        <div className="results-stat results-xp">
          <span className="results-label">{t("results.xp")}</span>
          <span className="results-value" data-testid="xp-earned">+{xpEarned} XP</span>
        </div>

        {gameType === "speed_round" && (
          <div className="results-stat">
            <span className="results-label">{t("results.cardsPerMinute")}</span>
            <span className="results-value" data-testid="cards-per-minute">{cardsPerMinute}</span>
          </div>
        )}
      </div>

      <div className="results-actions">
        <button
          data-testid="back-btn"
          onClick={() => navigate("/courses")}
        >
          {t("results.backToCourses")}
        </button>

        <button
          data-testid="study-again-btn"
          onClick={() =>
            navigate(`/courses/${courseId}/setup`, {
              state: { courseName },
            })
          }
        >
          {t("results.studyAgain")}
        </button>
      </div>
    </div>
  );
}
