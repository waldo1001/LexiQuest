import { useEffect, useReducer, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
  startSession as startSessionApi,
  postAttempts as postAttemptsApi,
  closeSession as closeSessionApi,
} from "../lib/api.js";
import { useT } from "../i18n/useT.js";
import { useTts, useAppContext } from "../context/AppContext.jsx";

/**
 * @typedef {{ id: string, question: string, answer: string, distractors?: string[] }} Card
 * @typedef {{ cardId: string, correct: boolean, mode: string, response_time_ms: number }} AttemptItem
 *
 * State machine:
 *   loading → empty | active
 *   active (self_grade): show question → show answer → grade → next card | retry pile
 *   active (mcq): show question + choices → grade on click → next card | retry pile
 *   all done → finishing → navigate to results
 */

/**
 * Resolve whether a card should use MCQ or self_grade for this session mode.
 * @param {Card} card
 * @param {string} sessionMode
 * @returns {"mcq"|"self_grade"}
 */
function resolveCardMode(card, sessionMode) {
  if (sessionMode === "self_grade") return "self_grade";
  const hasDistractors = Array.isArray(card.distractors) && card.distractors.length >= 2;
  return hasDistractors ? "mcq" : "self_grade";
}

function defaultShuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

const PHASE = {
  LOADING: "loading",
  EMPTY: "empty",
  QUESTION: "question",
  ANSWER: "answer",
  FINISHING: "finishing",
  ERROR: "error",
};

function init() {
  return {
    phase: PHASE.LOADING,
    sessionId: null,
    queue: [],          // remaining cards to show
    retryPile: [],      // wrong cards to show after queue drains
    cardIndex: 0,       // position in queue
    totalUnique: 0,     // total unique cards in the session
    firstTryResults: {}, // cardId → boolean (first-try outcome)
    pendingAttempts: [],  // AttemptItem[]
    startedAt: null,
    error: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "LOADED": {
      if (action.cards.length === 0) {
        return { ...state, phase: PHASE.EMPTY };
      }
      return {
        ...state,
        phase: PHASE.QUESTION,
        sessionId: action.sessionId,
        queue: action.cards,
        retryPile: [],
        cardIndex: 0,
        totalUnique: action.cards.length,
        firstTryResults: {},
        pendingAttempts: [],
        startedAt: Date.now(),
      };
    }
    case "SHOW_ANSWER":
      return { ...state, phase: PHASE.ANSWER };
    case "GRADE": {
      const { correct, responseTimeMs, cardMode = "self_grade" } = action;
      const card = state.queue[state.cardIndex];
      const cardId = card.id;
      const attempt = { cardId, correct, mode: cardMode, response_time_ms: responseTimeMs };
      const newAttempts = [...state.pendingAttempts, attempt];

      const isFirstTry = !(cardId in state.firstTryResults);
      const newFirstTry = isFirstTry
        ? { ...state.firstTryResults, [cardId]: correct }
        : state.firstTryResults;

      const newRetry = !correct ? [...state.retryPile, card] : state.retryPile;
      const nextIndex = state.cardIndex + 1;

      if (nextIndex < state.queue.length) {
        return {
          ...state,
          phase: PHASE.QUESTION,
          cardIndex: nextIndex,
          retryPile: newRetry,
          firstTryResults: newFirstTry,
          pendingAttempts: newAttempts,
        };
      }

      // Queue drained — move retry pile into queue
      if (newRetry.length > 0) {
        return {
          ...state,
          phase: PHASE.QUESTION,
          queue: newRetry,
          retryPile: [],
          cardIndex: 0,
          firstTryResults: newFirstTry,
          pendingAttempts: newAttempts,
        };
      }

      return { ...state, phase: PHASE.FINISHING, pendingAttempts: newAttempts, firstTryResults: newFirstTry };
    }
    case "ERROR":
      return { ...state, phase: PHASE.ERROR, error: action.error };
    default:
      return state;
  }
}

/**
 * @param {{
 *   startSession?: typeof startSessionApi,
 *   postAttempts?: typeof postAttemptsApi,
 *   closeSession?: typeof closeSessionApi,
 *   shuffleFn?: (arr: string[]) => string[],
 * }} props
 */
export default function StudySession({
  startSession = startSessionApi,
  postAttempts = postAttemptsApi,
  closeSession = closeSessionApi,
  shuffleFn = defaultShuffle,
}) {
  const t = useT();
  const tts = useTts();
  const { user } = useAppContext();
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseName = "", mode = "self_grade", courseLang = null } = location.state ?? {};
  const canSpeak = Boolean(courseLang && tts.isAvailable(courseLang));
  const autoSpeak = canSpeak && Boolean(user?.settings?.auto_speak);

  const [state, dispatch] = useReducer(reducer, undefined, init);

  // Load session on mount
  useEffect(() => {
    let cancelled = false;
    startSession({ courseId, mode })
      .then((data) => {
        if (!cancelled) dispatch({ type: "LOADED", sessionId: data.sessionId, cards: data.cards });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: "ERROR", error: String(err) });
      });
    return () => { cancelled = true; };
  }, [courseId, mode, startSession]);

  // Finish session when phase transitions to FINISHING
  const finishSession = useCallback(async () => {
    if (state.phase !== PHASE.FINISHING) return;
    try {
      const cardsStudied = state.totalUnique;
      const cardsCorrect = Object.values(state.firstTryResults).filter(Boolean).length;
      await postAttempts({ sessionId: state.sessionId, items: state.pendingAttempts });
      await closeSession(state.sessionId, { cards_studied: cardsStudied, cards_correct: cardsCorrect });
      navigate(`/courses/${courseId}/results`, {
        state: { sessionId: state.sessionId, courseName },
        replace: true,
      });
    } catch {
      dispatch({ type: "ERROR", error: "save failed" });
    }
  }, [state, courseId, courseName, postAttempts, closeSession, navigate]);

  useEffect(() => {
    if (state.phase === PHASE.FINISHING) finishSession();
  }, [state.phase, finishSession]);

  // Auto-speak question on new card, answer on reveal
  useEffect(() => {
    if (!autoSpeak) return;
    const card = state.queue[state.cardIndex];
    if (!card) return;
    if (state.phase === PHASE.QUESTION) tts.speak(card.question, courseLang);
    if (state.phase === PHASE.ANSWER) tts.speak(card.answer, courseLang);
  }, [state.phase, state.cardIndex, autoSpeak]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShowAnswer = useCallback(() => dispatch({ type: "SHOW_ANSWER" }), []);

  const handleGrade = useCallback((correct, cardMode = "self_grade") => {
    dispatch({ type: "GRADE", correct, responseTimeMs: 0, cardMode });
  }, []);

  const touchStartX = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (state.phase !== PHASE.ANSWER) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 60) return;
    handleGrade(dx > 0);
  }, [state.phase, handleGrade]);

  if (state.phase === PHASE.LOADING) {
    return <div className="study-session">{t("study.loading")}</div>;
  }
  if (state.phase === PHASE.ERROR) {
    return (
      <div className="study-session">
        <p>{t("study.error")}</p>
        <button onClick={() => navigate("/courses")}>{t("study.back")}</button>
      </div>
    );
  }
  if (state.phase === PHASE.EMPTY) {
    return (
      <div className="study-session">
        <p>{t("study.empty")}</p>
        <button onClick={() => navigate("/courses")}>{t("study.back")}</button>
      </div>
    );
  }
  if (state.phase === PHASE.FINISHING) {
    return <div className="study-session">{t("study.finishing")}</div>;
  }

  const card = state.queue[state.cardIndex];
  const position = state.cardIndex + 1;
  const total = state.queue.length + state.retryPile.length;
  const cardMode = resolveCardMode(card, mode);
  const isMcq = cardMode === "mcq";
  const mcqChoices = isMcq
    ? shuffleFn([card.answer, ...(card.distractors ?? [])])
    : null;

  return (
    <div className="study-session">
      <div className="study-progress">
        {t("study.progress", { current: position, total })}
      </div>

      <div
        className="study-card"
        data-testid="study-card"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="study-question">
          {card.question}
          {canSpeak && (
            <button
              className="speak-btn"
              aria-label={t("study.speakQuestion")}
              onClick={() => tts.speak(card.question, courseLang)}
            >🔊</button>
          )}
        </div>

        {state.phase === PHASE.ANSWER && (
          <div className="study-answer">
            {card.answer}
            {canSpeak && (
              <button
                className="speak-btn"
                aria-label={t("study.speakAnswer")}
                onClick={() => tts.speak(card.answer, courseLang)}
              >🔊</button>
            )}
          </div>
        )}
      </div>

      <div className="study-actions">
        {state.phase === PHASE.QUESTION && !isMcq && (
          <button className="btn btn-primary" onClick={handleShowAnswer}>
            {t("study.showAnswer")}
          </button>
        )}
        {state.phase === PHASE.QUESTION && isMcq && mcqChoices && (
          mcqChoices.map((choice) => (
            <button
              key={choice}
              className="btn btn-ghost"
              onClick={() => handleGrade(choice === card.answer, "mcq")}
            >
              {choice}
            </button>
          ))
        )}
        {state.phase === PHASE.ANSWER && (
          <>
            <button className="btn btn-primary" onClick={() => handleGrade(true)}>
              {t("study.knewIt")}
            </button>
            <button className="btn btn-secondary" onClick={() => handleGrade(false)}>
              {t("study.didntKnow")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
