import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useT } from "../i18n/useT.js";

const GAME_TYPES = [
  { value: "classic", labelKey: "setup.gameType.classic", descKey: "setup.gameType.classic.desc" },
  { value: "boss_round", labelKey: "setup.gameType.boss_round", descKey: "setup.gameType.boss_round.desc" },
  { value: "speed_round", labelKey: "setup.gameType.speed_round", descKey: "setup.gameType.speed_round.desc" },
  { value: "review_blitz", labelKey: "setup.gameType.review_blitz", descKey: "setup.gameType.review_blitz.desc" },
];

const CARD_COUNTS = [10, 15, 20, 30, null]; // null = All

const MODES = [
  { value: "self_grade", labelKey: "courses.modePicker.self_grade" },
  { value: "mcq", labelKey: "courses.modePicker.mcq" },
  { value: "mixed", labelKey: "courses.modePicker.mixed" },
];

export default function SessionSetup() {
  const t = useT();
  const navigate = useNavigate();
  const { courseId } = useParams();
  const location = useLocation();
  const {
    courseName = "",
    courseLang = null,
    defaultMode = "ask",
    questionLangDefault = null,
    answerLangDefault = null,
  } = location.state ?? {};

  const [gameType, setGameType] = useState("classic");
  const [cardLimit, setCardLimit] = useState(20);
  const [mode, setMode] = useState(defaultMode === "ask" ? "self_grade" : defaultMode);

  function handleStart() {
    navigate(`/courses/${courseId}/study`, {
      state: {
        gameType,
        cardLimit,
        mode,
        courseName,
        courseLang,
        questionLangDefault,
        answerLangDefault,
      },
    });
  }

  return (
    <div className="session-setup">
      <h1>{t("setup.title")}</h1>

      <section>
        <h2>{t("setup.gameType")}</h2>
        <div className="game-type-grid">
          {GAME_TYPES.map((gt) => (
            <button
              key={gt.value}
              className={`btn game-type-btn ${gameType === gt.value ? "selected" : ""}`}
              onClick={() => setGameType(gt.value)}
            >
              <strong>{t(gt.labelKey)}</strong>
              <span className="game-type-desc">{t(gt.descKey)}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t("setup.cardCount")}</h2>
        <div className="card-count-pills">
          {CARD_COUNTS.map((count) => (
            <button
              key={count ?? "all"}
              className={`btn pill ${cardLimit === count ? "selected" : ""}`}
              onClick={() => setCardLimit(count)}
            >
              {count ?? t("setup.cardCount.all")}
            </button>
          ))}
        </div>
      </section>

      {defaultMode === "ask" && (
        <section>
          <h2>{t("courses.modePicker.title")}</h2>
          <div className="mode-pills">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={`btn pill ${mode === m.value ? "selected" : ""}`}
                onClick={() => setMode(m.value)}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="btn btn-primary" onClick={handleStart}>
        {t("setup.start")}
      </button>
    </div>
  );
}
