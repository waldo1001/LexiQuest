import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { fetchCards as fetchCardsApi } from "../lib/api.js";
import { useT } from "../i18n/useT.js";

const GAME_TYPES = [
  { value: "classic", labelKey: "setup.gameType.classic", descKey: "setup.gameType.classic.desc" },
  { value: "boss_round", labelKey: "setup.gameType.boss_round", descKey: "setup.gameType.boss_round.desc" },
  { value: "speed_round", labelKey: "setup.gameType.speed_round", descKey: "setup.gameType.speed_round.desc" },
  { value: "review_blitz", labelKey: "setup.gameType.review_blitz", descKey: "setup.gameType.review_blitz.desc" },
];

const CARD_COUNTS = [10, 15, 20, 30, null]; // null = All

const CARD_ORDERS = [
  { value: "hardest_first", labelKey: "setup.cardOrder.hardest" },
  { value: "random", labelKey: "setup.cardOrder.random" },
  { value: "sequential", labelKey: "setup.cardOrder.sequential" },
];

const MODES = [
  { value: "self_grade", labelKey: "courses.modePicker.self_grade" },
  { value: "mcq", labelKey: "courses.modePicker.mcq" },
  { value: "mixed", labelKey: "courses.modePicker.mixed" },
];

/**
 * @param {{ fetchCards?: typeof fetchCardsApi }} props
 */
export default function SessionSetup({ fetchCards = fetchCardsApi }) {
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
  const [cardOrder, setCardOrder] = useState("hardest_first");
  const [mode, setMode] = useState(defaultMode === "ask" ? "self_grade" : defaultMode);
  const [uploadId, setUploadId] = useState(null);
  const [uploads, setUploads] = useState([]);

  // Fetch cards to build upload list
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetchCards(courseId)
      .then((cards) => {
        if (cancelled) return;
        const groups = new Map();
        for (const c of cards) {
          if (!c.upload_id) continue;
          let g = groups.get(c.upload_id);
          if (!g) {
            g = { uploadId: c.upload_id, name: c.upload_name ?? null, count: 0, earliest: c.created_at };
            groups.set(c.upload_id, g);
          }
          g.count++;
          if (c.upload_name && !g.name) g.name = c.upload_name;
          if (c.created_at && c.created_at < g.earliest) g.earliest = c.created_at;
        }
        const sorted = [...groups.values()].sort((a, b) => (a.earliest < b.earliest ? 1 : -1));
        setUploads(sorted);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [courseId, fetchCards]);

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  function handleStart() {
    navigate(`/courses/${courseId}/study`, {
      state: {
        gameType,
        cardLimit,
        cardOrder,
        mode,
        uploadId,
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

      <section>
        <h2>{t("setup.cardOrder")}</h2>
        <div className="card-order-pills">
          {CARD_ORDERS.map((co) => (
            <button
              key={co.value}
              className={`btn pill ${cardOrder === co.value ? "selected" : ""}`}
              onClick={() => setCardOrder(co.value)}
            >
              {t(co.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {uploads.length > 0 && (
        <section>
          <h2>{t("setup.upload")}</h2>
          <select
            data-testid="upload-picker"
            value={uploadId ?? ""}
            onChange={(e) => setUploadId(e.target.value || null)}
          >
            <option value="">{t("setup.upload.all")}</option>
            {uploads.map((up) => (
              <option key={up.uploadId} value={up.uploadId}>
                {up.name ?? formatDate(up.earliest)} ({up.count})
              </option>
            ))}
          </select>
        </section>
      )}

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
